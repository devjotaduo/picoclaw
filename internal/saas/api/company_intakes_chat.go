package api

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/sipeed/picoclaw/internal/saas/clara"
	"github.com/sipeed/picoclaw/internal/saas/litellm"
	"github.com/sipeed/picoclaw/internal/saas/store"
)

// claraTimeout is the max wall-clock budget for one chat turn (LLM streaming +
// tool dispatch + DB writes). LiteLLM upstream gets a longer client timeout
// inside the streaming client; this is the request-scoped cap.
const claraTimeout = 2 * time.Minute

// claraTextBudget is the in-flight cap on streamed text per turn, in bytes.
// Defends against runaway models and oversized SSE payloads.
const claraTextBudget = 8 * 1024

// chatRequestBody is the inbound payload from the browser.
type chatRequestBody struct {
	ResumeToken string `json:"resume_token"`
	Message     string `json:"message"`
}

// chatStoredMessage is one persisted entry in company_intakes.chat_messages.
// The shape is OpenAI-style so it can be replayed straight into a new LLM
// call when the user resumes a session from another device.
type chatStoredMessage struct {
	Role       string             `json:"role"` // user | assistant | tool
	Content    string             `json:"content,omitempty"`
	Name       string             `json:"name,omitempty"`
	ToolCalls  []litellm.ToolCall `json:"tool_calls,omitempty"`
	ToolCallID string             `json:"tool_call_id,omitempty"`
	CreatedAt  time.Time          `json:"created_at"`
}

// handleCompanyIntakeChat is the SSE entrypoint for the conversational Clara
// agent. It owns the full turn lifecycle: validate token → load history →
// stream model output → dispatch tool calls into the intake row → persist
// the new transcript.
func (h *Handler) handleCompanyIntakeChat(w http.ResponseWriter, r *http.Request) {
	if !h.Cfg.ClaraEnabled {
		writeError(w, http.StatusServiceUnavailable, "clara chat not enabled")
		return
	}
	if h.Cfg.LiteLLMURL == "" || h.Cfg.LiteLLMMasterKey == "" {
		writeError(w, http.StatusServiceUnavailable, "llm not configured")
		return
	}

	if !h.ClaraRateLimit.Allow(clientIP(r)) {
		writeError(w, http.StatusTooManyRequests, "muitas mensagens, tenta de novo em alguns minutos")
		return
	}

	id := chi.URLParam(r, "id")
	if id == "" {
		writeError(w, http.StatusBadRequest, "missing intake id")
		return
	}

	var req chatRequestBody
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid json")
		return
	}
	req.Message = strings.TrimSpace(req.Message)
	req.ResumeToken = strings.TrimSpace(req.ResumeToken)
	if req.Message == "" {
		writeError(w, http.StatusBadRequest, "message is required")
		return
	}
	if len(req.Message) > 4000 {
		writeError(w, http.StatusBadRequest, "message too long (max 4000 chars)")
		return
	}
	if req.ResumeToken == "" {
		writeError(w, http.StatusUnauthorized, "missing resume_token")
		return
	}
	tokenHash := store.CompanyIntakeTokenHash(req.ResumeToken)

	// Load intake to validate token and grab existing history before we send
	// any SSE headers (we still want to return JSON errors at this point).
	intake, err := h.CompanyIntakes.GetByToken(r.Context(), id, tokenHash)
	if errors.Is(err, store.ErrCompanyIntakeNotFound) {
		writeError(w, http.StatusUnauthorized, "intake not found or token invalid")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "db error")
		return
	}
	history := parseChatHistory(intake.ChatMessagesJSON)
	userTurns := 0
	for _, msg := range history {
		if msg.Role == "user" {
			userTurns++
		}
	}
	if userTurns >= h.Cfg.ClaraMaxTurns {
		writeError(w, http.StatusTooManyRequests, "limite de mensagens atingido")
		return
	}

	answers, err := clara.ParseAnswers(intake.AnswersJSON)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "answers parse: "+err.Error())
		return
	}

	// Append the user turn FIRST so a dropped connection still preserves the
	// transcript. The LLM call goes second.
	userMsg := chatStoredMessage{
		Role:      "user",
		Content:   req.Message,
		CreatedAt: time.Now().UTC(),
	}
	if _, err := h.appendChatMessage(r.Context(), id, tokenHash, userMsg); err != nil {
		writeError(w, http.StatusInternalServerError, "persist user msg: "+err.Error())
		return
	}
	history = append(history, userMsg)

	// Switch to SSE. Past this point we never call writeError — we emit `error`
	// events instead so the browser can render them in-stream.
	flusher, ok := w.(http.Flusher)
	if !ok {
		writeError(w, http.StatusInternalServerError, "streaming not supported")
		return
	}
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache, no-transform")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no") // nginx
	w.WriteHeader(http.StatusOK)
	flusher.Flush()

	ctx, cancel := context.WithTimeout(r.Context(), claraTimeout)
	defer cancel()

	emit := func(kind string, payload map[string]any) {
		if payload == nil {
			payload = map[string]any{}
		}
		payload["type"] = kind
		buf, _ := json.Marshal(payload)
		_, _ = fmt.Fprintf(w, "data: %s\n\n", buf)
		flusher.Flush()
	}

	client := litellm.NewClient(h.Cfg.LiteLLMURL, h.Cfg.LiteLLMMasterKey)

	// Function/tool calling round-trip: the first LLM call may answer only with
	// tool_calls (no text) and end with finish_reason=tool_calls. We then have
	// to append the tool results back into the message list and call the LLM
	// again so it can produce the actual user-facing reply. Empirically Claude
	// via LiteLLM/OpenRouter often spreads a single visitor utterance into 3-5
	// sequential tool calls (one per Clara tool) before composing the reply,
	// so we allow up to 8 round-trips before forcing the loop to break.
	const maxToolRoundTrips = 8

	var (
		qualifiedReason string
		shouldQualify   bool
	)

	for round := 0; round < maxToolRoundTrips; round++ {
		llmReq := buildClaraRequest(h.Cfg.ClaraModel, id, history)
		text, toolCalls, finish, sErr := streamOneTurn(ctx, client, llmReq, emit)
		if sErr != nil {
			emit("error", map[string]any{"message": sErr.Error()})
			_, _ = h.appendChatMessage(context.Background(), id, tokenHash, chatStoredMessage{
				Role:      "assistant",
				Content:   "(erro temporário)",
				CreatedAt: time.Now().UTC(),
			})
			return
		}

		// Persist this assistant turn (text + any tool calls) before processing
		// the tool side effects, so a crash mid-tool keeps the transcript valid.
		assistantMsg := chatStoredMessage{
			Role:      "assistant",
			Content:   text,
			ToolCalls: toolCalls,
			CreatedAt: time.Now().UTC(),
		}
		if _, err := h.appendChatMessage(ctx, id, tokenHash, assistantMsg); err != nil {
			emit("error", map[string]any{"message": "persist assistant: " + err.Error()})
			return
		}
		history = append(history, assistantMsg)

		// Dispatch tool calls, collect results to feed back to the model.
		toolResults := make([]chatStoredMessage, 0, len(toolCalls))
		for _, tc := range toolCalls {
			if tc.Function.Name == "" {
				continue // defensive: parser may emit empty tool_end on broken streams
			}
			mut, perr := clara.Apply(tc.Function.Name, json.RawMessage(tc.Function.Arguments), answers)
			if perr != nil {
				emit("tool_error", map[string]any{"name": tc.Function.Name, "error": perr.Error()})
				toolResults = append(toolResults, chatStoredMessage{
					Role:       "tool",
					ToolCallID: tc.ID,
					Name:       tc.Function.Name,
					Content:    `{"ok":false,"error":"` + escapeJSON(perr.Error()) + `"}`,
					CreatedAt:  time.Now().UTC(),
				})
				continue
			}
			if err := h.applyClaraMutation(ctx, id, tokenHash, mut); err != nil {
				emit("tool_error", map[string]any{"name": tc.Function.Name, "error": err.Error()})
				toolResults = append(toolResults, chatStoredMessage{
					Role:       "tool",
					ToolCallID: tc.ID,
					Name:       tc.Function.Name,
					Content:    `{"ok":false,"error":"` + escapeJSON(err.Error()) + `"}`,
					CreatedAt:  time.Now().UTC(),
				})
				continue
			}
			emit("tool_applied", map[string]any{"name": tc.Function.Name})

			// Emit a snapshot of the canonical extracted fields right after the
			// mutation lands. The browser uses this to render real values in the
			// "O que entendi" panel instead of staying at "(salvando…)".
			latest, lerr := h.CompanyIntakes.GetByToken(ctx, id, tokenHash)
			if lerr == nil && latest != nil {
				snap := answersSnapshot(latest)
				payload := map[string]any{
					"company_name": latest.CompanyName,
					"contact_name": latest.ContactName,
					"segments":     snap.segments,
					"channels":     snap.channels,
					"pains":        snap.pains,
					"systems":      snap.systems,
					"offer":        snap.offer,
					"website":      snap.website,
					"instagram":    snap.instagram,
					"crm_name":     snap.crmName,
					"crm_notes":    snap.crmNotes,
					"quoting_personalized": snap.quotingPersonalized,
					"quoting_notes":        snap.quotingNotes,
					"priority_agent":       snap.priorityAgent,
					"priority_reason":      snap.priorityReason,
					"problem_area":         snap.problemArea,
					"problem_area_note":    snap.problemAreaNote,
					"sales_online":         snap.salesOnline,
					"product_type":         snap.productType,
					"sales_note":           snap.salesNote,
				}
				emit("extracted", payload)
			}

			toolResults = append(toolResults, chatStoredMessage{
				Role:       "tool",
				ToolCallID: tc.ID,
				Name:       tc.Function.Name,
				Content:    `{"ok":true}`,
				CreatedAt:  time.Now().UTC(),
			})
			if mut.MarkQualified {
				shouldQualify = true
				qualifiedReason = mut.QualifiedReason
			}
		}

		// Persist tool results so the next loop iteration sees them in history
		// after a restart and the LLM doesn't re-run the same tool.
		for _, tr := range toolResults {
			if _, err := h.appendChatMessage(ctx, id, tokenHash, tr); err != nil {
				emit("error", map[string]any{"message": "persist tool result: " + err.Error()})
				return
			}
			history = append(history, tr)
		}

		// Loop again whenever the model used any tool. We don't trust
		// finish_reason here because LiteLLM proxying to OpenRouter often
		// rewrites it to "stop" even when the upstream Anthropic call ended
		// with tool_use — leaving us with tools applied but no follow-up
		// text. Forcing a second round lets the model see the tool results
		// and produce the conversational reply that closes the loop.
		_ = finish
		if len(toolCalls) == 0 {
			break
		}
	}

	if shouldQualify {
		if _, err := h.CompanyIntakes.MarkQualified(ctx, id, tokenHash); err != nil {
			emit("error", map[string]any{"message": "mark qualified: " + err.Error()})
		} else {
			// Flag the intake for Sofia's WhatsApp follow-up. We store both a
			// boolean (for fast admin filters) and a list of topics that still
			// need clarification — derived from what Clara *didn't* capture.
			if err := h.markIntakeForFollowup(ctx, id, tokenHash); err == nil {
				emit("qualified", map[string]any{
					"reason":                  qualifiedReason,
					"needs_whatsapp_followup": true,
				})
			} else {
				emit("qualified", map[string]any{"reason": qualifiedReason})
			}
		}
	}

	emit("done", nil)
}

// streamOneTurn issues one streaming call to the LLM, forwards every text
// delta to the client via emit(), accumulates tool calls, and returns the
// final assembled text, tool calls, and finish_reason. Errors from the SSE
// parser are surfaced too.
func streamOneTurn(
	ctx context.Context,
	client *litellm.Client,
	req *litellm.ChatRequest,
	emit func(kind string, payload map[string]any),
) (text string, toolCalls []litellm.ToolCall, finish string, err error) {
	var (
		assistantText   strings.Builder
		currentToolArgs strings.Builder
		currentToolID   string
		currentToolName string
		textOverBudget  bool
	)

	err = client.ChatStream(ctx, req, func(ev litellm.StreamEvent) error {
		switch ev.Kind {
		case litellm.StreamText:
			if textOverBudget {
				return nil
			}
			if assistantText.Len()+len(ev.Text) > claraTextBudget {
				textOverBudget = true
				emit("warning", map[string]any{"message": "resposta truncada"})
				return nil
			}
			assistantText.WriteString(ev.Text)
			emit("text", map[string]any{"delta": ev.Text})
		case litellm.StreamToolStart:
			currentToolID = ev.Tool.ID
			currentToolName = ev.Tool.Function.Name
			currentToolArgs.Reset()
			emit("tool_start", map[string]any{"id": currentToolID, "name": currentToolName})
		case litellm.StreamToolArgs:
			currentToolArgs.WriteString(ev.Args)
		case litellm.StreamToolEnd:
			if currentToolName == "" && currentToolID == "" {
				// Defensive: some upstreams emit a final tool_end on the [DONE]
				// sentinel even when no tool was opened. Skip silently.
				return nil
			}
			toolCalls = append(toolCalls, litellm.ToolCall{
				ID:   currentToolID,
				Type: "function",
				Function: litellm.ToolCallFunction{
					Name:      currentToolName,
					Arguments: currentToolArgs.String(),
				},
			})
			currentToolID, currentToolName = "", ""
			currentToolArgs.Reset()
		case litellm.StreamError:
			emit("error", map[string]any{"message": ev.Err.Error()})
		case litellm.StreamDone:
			finish = ev.Finish
		}
		return nil
	})
	text = assistantText.String()
	return text, toolCalls, finish, err
}

// markIntakeForFollowup tags answers.needs_whatsapp_followup=true plus a list
// of topics that Clara intentionally left for Sofia (preços, integrações,
// detalhes técnicos). The admin UI filters submitted intakes by this flag
// when prioritising who Sofia must call back.
func (h *Handler) markIntakeForFollowup(ctx context.Context, id, tokenHash string) error {
	intake, err := h.CompanyIntakes.GetByToken(ctx, id, tokenHash)
	if err != nil {
		return err
	}
	parsed, err := clara.ParseAnswers(intake.AnswersJSON)
	if err != nil || parsed == nil {
		return err
	}
	if parsed.Extra == nil {
		parsed.Extra = map[string]any{}
	}
	parsed.Extra["needs_whatsapp_followup"] = true
	parsed.Extra["followup_topics"] = followupTopicsFor(parsed)

	raw, err := parsed.Marshal()
	if err != nil {
		return err
	}
	_, err = h.CompanyIntakes.SaveDraft(ctx, id, tokenHash,
		intake.CompanyName, intake.ContactName,
		intake.ContactEmail, intake.ContactWhatsApp,
		raw, intake.AudioTranscript)
	return err
}

// followupTopicsFor enumerates what Sofia still needs to clarify on WhatsApp
// based on what Clara did NOT manage to capture. Stays high-level — actual
// data collection is Sofia's job, this list just primes her conversation.
func followupTopicsFor(a *clara.Answers) []string {
	topics := []string{}
	if a.QuotingPersonalized != nil && *a.QuotingPersonalized {
		topics = append(topics, "variáveis e tabela de preços do orçamento")
	}
	if a.CRMName != "" {
		topics = append(topics, "credenciais e dados de integração do "+a.CRMName)
	}
	if a.SalesOnline != nil && *a.SalesOnline {
		topics = append(topics, "plataformas/marketplace onde vende online")
	}
	switch a.ProblemArea {
	case "agendamento":
		topics = append(topics, "ferramenta de agenda atual e janela típica de horários")
	case "vendas":
		topics = append(topics, "ticket médio e ciclo de venda")
	case "suporte":
		topics = append(topics, "principais reclamações e prazo médio de resposta")
	case "marketing":
		topics = append(topics, "linha editorial do Instagram e frequência de posts")
	case "gestao":
		topics = append(topics, "quais relatórios o dono olha hoje (se algum)")
	}
	topics = append(topics,
		"horários de atendimento detalhados",
		"3 a 5 FAQs mais comuns",
		"diretrizes de marca e tom de voz",
	)
	return topics
}

// extractedSnapshot is the typed shape we forward to the browser in the
// `extracted` SSE event. The keys mirror clara.Answers so the front-end can
// merge them into its existing ClaraExtracted state without a translation.
type extractedSnapshot struct {
	segments []string
	channels []string
	pains    []string
	systems  []string

	offer     string
	website   string
	instagram string
	crmName   string
	crmNotes  string

	// nil = unanswered, non-nil = explicit yes/no from the visitor
	quotingPersonalized *bool
	quotingNotes        string

	priorityAgent  string
	priorityReason string

	problemArea     string
	problemAreaNote string
	salesOnline     *bool
	productType     string
	salesNote       string
}

func answersSnapshot(intake *store.CompanyIntake) extractedSnapshot {
	parsed, err := clara.ParseAnswers(intake.AnswersJSON)
	if err != nil || parsed == nil {
		return extractedSnapshot{}
	}
	return extractedSnapshot{
		segments:            nonNilStrings(parsed.Segments),
		channels:            nonNilStrings(parsed.Channels),
		pains:               nonNilStrings(parsed.Pains),
		systems:             nonNilStrings(parsed.Systems),
		offer:               parsed.Offer,
		website:             parsed.Website,
		instagram:           parsed.Instagram,
		crmName:             parsed.CRMName,
		crmNotes:            parsed.CRMNotes,
		quotingPersonalized: parsed.QuotingPersonalized,
		quotingNotes:        parsed.QuotingNotes,
		priorityAgent:       parsed.PriorityAgent,
		priorityReason:      parsed.PriorityReason,
		problemArea:         parsed.ProblemArea,
		problemAreaNote:     parsed.ProblemAreaNote,
		salesOnline:         parsed.SalesOnline,
		productType:         parsed.ProductType,
		salesNote:           parsed.SalesNote,
	}
}

func nonNilStrings(in []string) []string {
	if in == nil {
		return []string{}
	}
	return in
}

// escapeJSON escapes a string for safe inclusion in a JSON literal.
func escapeJSON(s string) string {
	b, _ := json.Marshal(s)
	if len(b) >= 2 {
		return string(b[1 : len(b)-1])
	}
	return s
}

// buildClaraRequest assembles the streaming request to LiteLLM, including the
// system prompt, full transcript so far, and the tool catalog.
func buildClaraRequest(model, intakeID string, history []chatStoredMessage) *litellm.ChatRequest {
	messages := make([]litellm.Message, 0, len(history)+1)
	messages = append(messages, litellm.Message{
		Role:    "system",
		Content: clara.SystemPrompt,
	})
	for _, m := range history {
		messages = append(messages, litellm.Message{
			Role:       m.Role,
			Content:    m.Content,
			Name:       m.Name,
			ToolCalls:  m.ToolCalls,
			ToolCallID: m.ToolCallID,
		})
	}

	tools := make([]litellm.ToolSpec, 0, len(clara.Tools()))
	for _, t := range clara.Tools() {
		raw, _ := json.Marshal(t)
		tools = append(tools, raw)
	}

	return &litellm.ChatRequest{
		Model:       model,
		Messages:    messages,
		Tools:       tools,
		Temperature: 0.6,
		MaxTokens:   1200, // headroom: 3-5 tool calls + a conversational reply
		User:        intakeID,
	}
}

// applyClaraMutation persists the side effect of one tool call.
func (h *Handler) applyClaraMutation(ctx context.Context, id, tokenHash string, mut *clara.IntakeMutation) error {
	if mut.AnswersDelta == nil && mut.ContactName == "" && mut.CompanyName == "" {
		return nil
	}
	// Use SaveDraft for any identity/answers change. It returns the latest row
	// but we ignore it: the next turn will refetch.
	intake, err := h.CompanyIntakes.GetByToken(ctx, id, tokenHash)
	if err != nil {
		return err
	}
	companyName := intake.CompanyName
	contactName := intake.ContactName
	if mut.CompanyName != "" {
		companyName = mut.CompanyName
	}
	if mut.ContactName != "" {
		contactName = mut.ContactName
	}
	var answersJSON json.RawMessage
	if mut.AnswersDelta != nil {
		raw, merr := mut.AnswersDelta.Marshal()
		if merr != nil {
			return merr
		}
		answersJSON = raw
	} else {
		answersJSON = intake.AnswersJSON
	}
	_, err = h.CompanyIntakes.SaveDraft(ctx,
		id, tokenHash,
		companyName, contactName,
		intake.ContactEmail, intake.ContactWhatsApp,
		answersJSON, intake.AudioTranscript,
	)
	return err
}

// appendChatMessage marshals one chatStoredMessage and pushes it onto the
// JSONB array column.
func (h *Handler) appendChatMessage(
	ctx context.Context, id, tokenHash string, msg chatStoredMessage,
) (*store.CompanyIntake, error) {
	raw, err := json.Marshal(msg)
	if err != nil {
		return nil, err
	}
	return h.CompanyIntakes.AppendChatMessage(ctx, id, tokenHash, raw)
}

// parseChatHistory decodes the JSONB array; tolerates legacy intakes where the
// column is NULL or empty.
func parseChatHistory(raw json.RawMessage) []chatStoredMessage {
	if len(raw) == 0 {
		return nil
	}
	var out []chatStoredMessage
	if err := json.Unmarshal(raw, &out); err != nil {
		return nil
	}
	return out
}
