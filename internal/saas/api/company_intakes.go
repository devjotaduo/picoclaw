package api

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"mime"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/sipeed/picoclaw/internal/saas/store"
)

const maxCompanyIntakeUploadBytes = 10 << 20

type companyIntakeAttachment struct {
	ID         string    `json:"id"`
	Kind       string    `json:"kind"`
	Name       string    `json:"name"`
	Mime       string    `json:"mime"`
	Size       int64     `json:"size"`
	Path       string    `json:"path,omitempty"`
	UploadedAt time.Time `json:"uploaded_at"`
}

type publicIntakeResponse struct {
	ID              string                    `json:"id"`
	ResumeToken     string                    `json:"resume_token,omitempty"`
	Status          store.CompanyIntakeStatus `json:"status"`
	CompanyName     string                    `json:"company_name"`
	ContactName     string                    `json:"contact_name"`
	ContactEmail    string                    `json:"contact_email"`
	ContactWhatsApp string                    `json:"contact_whatsapp"`
	Answers         json.RawMessage           `json:"answers"`
	Attachments     json.RawMessage           `json:"attachments"`
	AudioTranscript string                    `json:"audio_transcript,omitempty"`
	PublicSummary   json.RawMessage           `json:"public_summary"`
	CreatedAt       time.Time                 `json:"created_at"`
	UpdatedAt       time.Time                 `json:"updated_at"`
	SubmittedAt     *time.Time                `json:"submitted_at"`
}

func (h *Handler) handleCreateCompanyIntake(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Source   string `json:"source"`
		Honeypot string `json:"company_website_extra"`
	}
	_ = json.NewDecoder(r.Body).Decode(&req)
	if strings.TrimSpace(req.Honeypot) != "" {
		writeError(w, http.StatusBadRequest, "invalid request")
		return
	}
	id, err := store.NewCompanyIntakeID()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "token error")
		return
	}
	token, err := store.NewCompanyIntakeResumeToken()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "token error")
		return
	}
	intake := &store.CompanyIntake{ID: id, Source: req.Source}
	if err := h.CompanyIntakes.Create(r.Context(), intake, store.CompanyIntakeTokenHash(token), hashPublicValue(clientIP(r)), r.UserAgent()); err != nil {
		writeError(w, http.StatusInternalServerError, "db error")
		return
	}
	resp := toPublicIntakeResponse(intake)
	resp.ResumeToken = token
	writeJSON(w, http.StatusCreated, resp)
}

func (h *Handler) handleGetPublicCompanyIntake(w http.ResponseWriter, r *http.Request) {
	intake, ok := h.publicIntakeByToken(w, r)
	if !ok {
		return
	}
	writeJSON(w, http.StatusOK, toPublicIntakeResponse(intake))
}

func (h *Handler) handleSaveCompanyIntakeAnswers(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var req struct {
		ResumeToken     string          `json:"resume_token"`
		CompanyName     string          `json:"company_name"`
		ContactName     string          `json:"contact_name"`
		ContactEmail    string          `json:"contact_email"`
		ContactWhatsApp string          `json:"contact_whatsapp"`
		Answers         json.RawMessage `json:"answers"`
		AudioTranscript string          `json:"audio_transcript"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid json")
		return
	}
	if len(req.Answers) == 0 {
		req.Answers = json.RawMessage(`{}`)
	}
	intake, err := h.CompanyIntakes.SaveDraft(
		r.Context(),
		id,
		store.CompanyIntakeTokenHash(req.ResumeToken),
		strings.TrimSpace(req.CompanyName),
		strings.TrimSpace(req.ContactName),
		strings.TrimSpace(req.ContactEmail),
		strings.TrimSpace(req.ContactWhatsApp),
		req.Answers,
		strings.TrimSpace(req.AudioTranscript),
	)
	if err != nil {
		handleIntakeErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, toPublicIntakeResponse(intake))
}

func (h *Handler) handleUploadCompanyIntakeAttachment(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	r.Body = http.MaxBytesReader(w, r.Body, maxCompanyIntakeUploadBytes+1024)
	if err := r.ParseMultipartForm(maxCompanyIntakeUploadBytes); err != nil {
		writeError(w, http.StatusBadRequest, "arquivo muito grande ou formulário inválido")
		return
	}
	token := r.FormValue("resume_token")
	kind := strings.TrimSpace(r.FormValue("kind"))
	if kind == "" {
		kind = "documento"
	}
	intake, ok := h.publicIntakeByTokenValue(w, r, id, token)
	if !ok {
		return
	}
	if intake.Status == store.CompanyIntakeSubmitted || intake.Status == store.CompanyIntakeReviewed || intake.Status == store.CompanyIntakeLinked {
		writeError(w, http.StatusConflict, "intake já enviado")
		return
	}
	file, header, err := r.FormFile("file")
	if err != nil {
		writeError(w, http.StatusBadRequest, "arquivo obrigatório")
		return
	}
	defer file.Close()
	if header.Size > maxCompanyIntakeUploadBytes {
		writeError(w, http.StatusBadRequest, "arquivo deve ter até 10 MB")
		return
	}
	name := filepath.Base(header.Filename)
	ext := strings.ToLower(filepath.Ext(name))
	if !allowedIntakeUploadExt(ext) {
		writeError(w, http.StatusBadRequest, "tipo de arquivo não permitido")
		return
	}
	attachmentID, err := store.NewCompanyIntakeID()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "token error")
		return
	}
	dir := filepath.Join(h.Cfg.CompanyIntakeUploadDir, id)
	if err := os.MkdirAll(dir, 0o750); err != nil {
		writeError(w, http.StatusInternalServerError, "erro ao preparar upload")
		return
	}
	storedPath := filepath.Join(dir, attachmentID+ext)
	dst, err := os.OpenFile(storedPath, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0o640)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "erro ao salvar upload")
		return
	}
	size, copyErr := io.Copy(dst, io.LimitReader(file, maxCompanyIntakeUploadBytes+1))
	closeErr := dst.Close()
	if copyErr != nil || closeErr != nil || size > maxCompanyIntakeUploadBytes {
		_ = os.Remove(storedPath)
		writeError(w, http.StatusBadRequest, "arquivo inválido")
		return
	}
	mimeType := header.Header.Get("Content-Type")
	if mimeType == "" {
		mimeType = mime.TypeByExtension(ext)
	}
	attachments := decodeAttachments(intake.AttachmentsJSON)
	attachments = append(attachments, companyIntakeAttachment{
		ID:         attachmentID,
		Kind:       kind,
		Name:       name,
		Mime:       mimeType,
		Size:       size,
		Path:       storedPath,
		UploadedAt: time.Now().UTC(),
	})
	raw, _ := json.Marshal(attachments)
	updated, err := h.CompanyIntakes.SaveAttachments(r.Context(), id, store.CompanyIntakeTokenHash(token), raw)
	if err != nil {
		handleIntakeErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, toPublicIntakeResponse(updated))
}

func (h *Handler) handleSaveCompanyIntakeAudioTranscript(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var req struct {
		ResumeToken string `json:"resume_token"`
		Transcript  string `json:"transcript"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid json")
		return
	}
	intake, ok := h.publicIntakeByTokenValue(w, r, id, req.ResumeToken)
	if !ok {
		return
	}
	updated, err := h.CompanyIntakes.SaveDraft(
		r.Context(),
		id,
		store.CompanyIntakeTokenHash(req.ResumeToken),
		intake.CompanyName,
		intake.ContactName,
		intake.ContactEmail,
		intake.ContactWhatsApp,
		intake.AnswersJSON,
		strings.TrimSpace(req.Transcript),
	)
	if err != nil {
		handleIntakeErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, toPublicIntakeResponse(updated))
}

func (h *Handler) handleGenerateCompanyIntakeReport(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var req struct {
		ResumeToken string `json:"resume_token"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid json")
		return
	}
	intake, ok := h.publicIntakeByTokenValue(w, r, id, req.ResumeToken)
	if !ok {
		return
	}
	if err := validateIntakeMinimum(intake); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	report, summary := h.buildCompanyIntakeReport(r.Context(), intake)
	updated, err := h.CompanyIntakes.SaveReport(r.Context(), id, store.CompanyIntakeTokenHash(req.ResumeToken), report, summary)
	if err != nil {
		handleIntakeErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, toPublicIntakeResponse(updated))
}

func (h *Handler) handleSubmitCompanyIntake(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var req struct {
		ResumeToken string `json:"resume_token"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid json")
		return
	}
	intake, ok := h.publicIntakeByTokenValue(w, r, id, req.ResumeToken)
	if !ok {
		return
	}
	if err := validateIntakeMinimum(intake); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if len(intake.PublicSummaryJSON) == 0 || string(intake.PublicSummaryJSON) == "{}" {
		report, summary := h.buildCompanyIntakeReport(r.Context(), intake)
		if _, err := h.CompanyIntakes.SaveReport(r.Context(), id, store.CompanyIntakeTokenHash(req.ResumeToken), report, summary); err != nil {
			handleIntakeErr(w, err)
			return
		}
	}
	submitted, err := h.CompanyIntakes.Submit(r.Context(), id, store.CompanyIntakeTokenHash(req.ResumeToken))
	if err != nil {
		handleIntakeErr(w, err)
		return
	}

	// Auto-provision: now that the visitor has supplied email + whatsapp via
	// ClaraFinalize, hand the qualified+submitted intake to the provisioner.
	// (Previously this ran during the chat SSE, but at that point contact_email
	// was still empty — Sofia's mark_qualified fires before the finalize form
	// collects the contact info.) We return the provision result in the same
	// response so the UI can show the dashboard URL + login mode in one shot.
	base := toPublicIntakeResponse(submitted)
	// Convert struct -> map so we can splice in provisioning fields.
	resp := map[string]any{}
	if raw, mErr := json.Marshal(base); mErr == nil {
		_ = json.Unmarshal(raw, &resp)
	}
	notLinked := submitted.LinkedTenantID == nil || *submitted.LinkedTenantID == ""
	if h.AutoProvision != nil && notLinked && submitted.ContactEmail != "" && submitted.CompanyName != "" {
		log.Printf("submit: AutoProvision.Run starting intake=%s company=%q email=%q", id, submitted.CompanyName, submitted.ContactEmail)
		res, perr := h.AutoProvision.Run(r.Context(), submitted, clientIP(r))
		switch {
		case perr != nil:
			log.Printf("submit: AutoProvision.Run ERR intake=%s err=%v", id, perr)
			resp["provision_error"] = perr.Error()
		case res.AlreadyExists:
			log.Printf("submit: AutoProvision tenant_already_exists intake=%s url=%s", id, res.URL)
			resp["tenant_already_exists"] = true
			resp["url"] = res.URL
			resp["subdomain"] = res.Subdomain
			resp["email"] = res.Email
		default:
			log.Printf("submit: AutoProvision tenant_provisioned intake=%s url=%s mode=%s", id, res.URL, res.LoginMode)
			resp["tenant_provisioned"] = true
			resp["url"] = res.URL
			resp["subdomain"] = res.Subdomain
			resp["email"] = res.Email
			resp["login_mode"] = res.LoginMode
			// A partir da unificação, sempre que Supabase está ligado a gente
			// gera senha + magic link e dispara email transacional com ambos.
			// Emitir initial_password no SSE permite que o Clara mostre as
			// credenciais na hora; check_email avisa o visitante que o email
			// também foi enviado.
			if res.InitialPassword != "" {
				resp["initial_password"] = res.InitialPassword
				resp["check_email"] = true
			} else if res.LoginMode == "magic_link" {
				resp["check_email"] = true
			}
		}
	}
	writeJSON(w, http.StatusOK, resp)
}

func (h *Handler) handleListCompanyIntakes(w http.ResponseWriter, r *http.Request) {
	items, err := h.CompanyIntakes.List(r.Context(), r.URL.Query().Get("status"), 100)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "db error")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"intakes": items})
}

func (h *Handler) handleGetCompanyIntake(w http.ResponseWriter, r *http.Request) {
	intake, err := h.CompanyIntakes.Get(r.Context(), chi.URLParam(r, "id"))
	if err != nil {
		handleIntakeErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, intake)
}

func (h *Handler) handleUpdateCompanyIntakeStatus(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Status store.CompanyIntakeStatus `json:"status"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid json")
		return
	}
	switch req.Status {
	case store.CompanyIntakeReviewed, store.CompanyIntakeSubmitted, store.CompanyIntakeDraft:
	default:
		writeError(w, http.StatusBadRequest, "status inválido")
		return
	}
	intake, err := h.CompanyIntakes.SetStatus(r.Context(), chi.URLParam(r, "id"), req.Status)
	if err != nil {
		handleIntakeErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, intake)
}

func (h *Handler) handleLinkCompanyIntakeTenant(w http.ResponseWriter, r *http.Request) {
	var req struct {
		TenantID string `json:"tenant_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid json")
		return
	}
	if strings.TrimSpace(req.TenantID) == "" {
		writeError(w, http.StatusBadRequest, "tenant_id obrigatório")
		return
	}
	if _, err := h.Tenants.Get(r.Context(), req.TenantID); err != nil {
		writeError(w, http.StatusBadRequest, "tenant não encontrado")
		return
	}
	intake, err := h.CompanyIntakes.LinkTenant(r.Context(), chi.URLParam(r, "id"), req.TenantID)
	if err != nil {
		handleIntakeErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, intake)
}

func (h *Handler) handleDownloadCompanyIntakeAttachment(w http.ResponseWriter, r *http.Request) {
	intake, err := h.CompanyIntakes.Get(r.Context(), chi.URLParam(r, "id"))
	if err != nil {
		handleIntakeErr(w, err)
		return
	}
	attachmentID := chi.URLParam(r, "attachmentId")
	for _, a := range decodeAttachments(intake.AttachmentsJSON) {
		if a.ID != attachmentID {
			continue
		}
		if a.Path == "" || !strings.HasPrefix(filepath.Clean(a.Path), filepath.Clean(h.Cfg.CompanyIntakeUploadDir)) {
			writeError(w, http.StatusNotFound, "arquivo não encontrado")
			return
		}
		w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=%q", a.Name))
		http.ServeFile(w, r, a.Path)
		return
	}
	writeError(w, http.StatusNotFound, "anexo não encontrado")
}

func (h *Handler) publicIntakeByToken(w http.ResponseWriter, r *http.Request) (*store.CompanyIntake, bool) {
	return h.publicIntakeByTokenValue(w, r, chi.URLParam(r, "id"), r.URL.Query().Get("resume_token"))
}

func (h *Handler) publicIntakeByTokenValue(w http.ResponseWriter, r *http.Request, id, token string) (*store.CompanyIntake, bool) {
	if strings.TrimSpace(id) == "" || strings.TrimSpace(token) == "" {
		writeError(w, http.StatusUnauthorized, "token de retomada obrigatório")
		return nil, false
	}
	intake, err := h.CompanyIntakes.GetByToken(r.Context(), id, store.CompanyIntakeTokenHash(token))
	if err != nil {
		handleIntakeErr(w, err)
		return nil, false
	}
	return intake, true
}

func validateIntakeMinimum(intake *store.CompanyIntake) error {
	if strings.TrimSpace(intake.CompanyName) == "" {
		return errors.New("informe o nome da empresa")
	}
	if strings.TrimSpace(intake.ContactName) == "" {
		return errors.New("informe o responsável")
	}
	if strings.TrimSpace(intake.ContactWhatsApp) == "" && strings.TrimSpace(intake.ContactEmail) == "" {
		return errors.New("informe WhatsApp ou e-mail")
	}
	var answers map[string]any
	_ = json.Unmarshal(intake.AnswersJSON, &answers)
	if strings.TrimSpace(fmt.Sprint(answers["business_type"])) == "" || strings.TrimSpace(fmt.Sprint(answers["offer"])) == "" {
		return errors.New("complete tipo de empresa e oferta principal")
	}
	return nil
}

func toPublicIntakeResponse(intake *store.CompanyIntake) publicIntakeResponse {
	return publicIntakeResponse{
		ID:              intake.ID,
		Status:          intake.Status,
		CompanyName:     intake.CompanyName,
		ContactName:     intake.ContactName,
		ContactEmail:    intake.ContactEmail,
		ContactWhatsApp: intake.ContactWhatsApp,
		Answers:         intake.AnswersJSON,
		Attachments:     stripAttachmentPaths(intake.AttachmentsJSON),
		AudioTranscript: intake.AudioTranscript,
		PublicSummary:   intake.PublicSummaryJSON,
		CreatedAt:       intake.CreatedAt,
		UpdatedAt:       intake.UpdatedAt,
		SubmittedAt:     intake.SubmittedAt,
	}
}

func stripAttachmentPaths(raw json.RawMessage) json.RawMessage {
	attachments := decodeAttachments(raw)
	for i := range attachments {
		attachments[i].Path = ""
	}
	out, _ := json.Marshal(attachments)
	return out
}

func decodeAttachments(raw json.RawMessage) []companyIntakeAttachment {
	var attachments []companyIntakeAttachment
	if len(raw) > 0 {
		_ = json.Unmarshal(raw, &attachments)
	}
	if attachments == nil {
		return []companyIntakeAttachment{}
	}
	return attachments
}

func handleIntakeErr(w http.ResponseWriter, err error) {
	if errors.Is(err, store.ErrCompanyIntakeNotFound) {
		writeError(w, http.StatusNotFound, "intake não encontrado")
		return
	}
	writeError(w, http.StatusInternalServerError, "db error")
}

func allowedIntakeUploadExt(ext string) bool {
	switch ext {
	case ".pdf", ".png", ".jpg", ".jpeg", ".webp", ".csv", ".xlsx", ".xls", ".doc", ".docx", ".txt":
		return true
	default:
		return false
	}
}

func hashPublicValue(v string) string {
	sum := sha256.Sum256([]byte(v))
	return hex.EncodeToString(sum[:])
}

func (h *Handler) buildCompanyIntakeReport(ctx context.Context, intake *store.CompanyIntake) (json.RawMessage, json.RawMessage) {
	if h.Cfg.LiteLLMURL != "" && h.Cfg.LiteLLMMasterKey != "" && h.Cfg.IntakeLLMModel != "" {
		if report, summary, err := h.buildCompanyIntakeReportWithLLM(ctx, intake); err == nil {
			return report, summary
		}
	}
	return buildFallbackCompanyIntakeReport(intake)
}

func (h *Handler) buildCompanyIntakeReportWithLLM(ctx context.Context, intake *store.CompanyIntake) (json.RawMessage, json.RawMessage, error) {
	ctx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()
	payload := map[string]any{
		"model": h.Cfg.IntakeLLMModel,
		"messages": []map[string]string{
			{
				"role":    "system",
				"content": "Você é Clara, consultora de pré-cadastro. Gere somente JSON válido com chaves report e public_summary. O report é completo para equipe interna. O public_summary é curto para a empresa confirmar. Nunca peça credenciais.",
			},
			{
				"role": "user",
				"content": string(mustJSON(map[string]any{
					"company_name":     intake.CompanyName,
					"contact_name":     intake.ContactName,
					"answers":          json.RawMessage(intake.AnswersJSON),
					"attachments":      stripAttachmentPaths(intake.AttachmentsJSON),
					"audio_transcript": intake.AudioTranscript,
				})),
			},
		},
		"temperature": 0.2,
	}
	body, _ := json.Marshal(payload)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, strings.TrimRight(h.Cfg.LiteLLMURL, "/")+"/chat/completions", bytes.NewReader(body))
	if err != nil {
		return nil, nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+h.Cfg.LiteLLMMasterKey)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, nil, fmt.Errorf("llm status %d", resp.StatusCode)
	}
	var out struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return nil, nil, err
	}
	if len(out.Choices) == 0 {
		return nil, nil, errors.New("empty llm response")
	}
	var parsed struct {
		Report        json.RawMessage `json:"report"`
		PublicSummary json.RawMessage `json:"public_summary"`
	}
	if err := json.Unmarshal([]byte(out.Choices[0].Message.Content), &parsed); err != nil {
		return nil, nil, err
	}
	if len(parsed.Report) == 0 || len(parsed.PublicSummary) == 0 {
		return nil, nil, errors.New("missing report")
	}
	return parsed.Report, parsed.PublicSummary, nil
}

func buildFallbackCompanyIntakeReport(intake *store.CompanyIntake) (json.RawMessage, json.RawMessage) {
	var answers map[string]any
	_ = json.Unmarshal(intake.AnswersJSON, &answers)
	attachments := stripAttachmentPaths(intake.AttachmentsJSON)
	pains := asStrings(answers["pains"])
	channels := asStrings(answers["channels"])
	systems := asStrings(answers["systems"])
	rules := asStrings(answers["rules"])
	businessType := fmt.Sprint(answers["business_type"])
	offer := fmt.Sprint(answers["offer"])
	brandSoul := fmt.Sprint(answers["brand_soul"])
	if brandSoul == "" || brandSoul == "<nil>" {
		brandSoul = "Ainda precisa ser refinada com exemplos de linguagem, diferenciais e limites de atendimento."
	}
	report := map[string]any{
		"generated_by":    "Clara",
		"mode":            "fallback",
		"company_summary": fmt.Sprintf("%s é uma empresa do tipo %s. A oferta principal informada foi: %s.", intake.CompanyName, valueOr(businessType, "não informado"), valueOr(offer, "não informado")),
		"brand_soul":      brandSoul,
		"products_services_and_materials": map[string]any{
			"offer":       offer,
			"materials":   json.RawMessage(attachments),
			"budget_info": fmt.Sprint(answers["budget_rules"]),
		},
		"channels_and_systems": map[string]any{
			"channels": channels,
			"systems":  systems,
		},
		"main_bottlenecks":             pains,
		"budget_and_calculation_rules": fmt.Sprint(answers["budget_rules"]),
		"future_integrations":          systems,
		"agent_recommendations": map[string]any{
			"Clara":  "Atender no WhatsApp público, responder dúvidas frequentes, fazer triagem e encaminhar oportunidades.",
			"Marcos": "Classificar leads, registrar interesse, conduzir follow-up e organizar oportunidades comerciais.",
			"Camila": "Cuidar de pós-venda, suporte e reclamações; consultar histórico e orientar o cliente.",
			"Lia":    "Transformar diferenciais e materiais em campanhas, posts, catálogos e páginas simples.",
			"Rafael": "Acompanhar a operação de forma interna, alertar o dono sobre leads quentes, atendimentos parados e oportunidades.",
			"Sofia":  "Receber o dono no painel, conduzir onboarding por segmento, validar memória da empresa.",
		},
		"missing_data": missingIntakeData(intake, answers),
		"risks_and_limits": append([]string{
			"Não coletar senhas, tokens, hosts privados ou credenciais nesta etapa.",
			"Assuntos sensíveis e descontos fora da regra devem ir para aprovação humana.",
		}, rules...),
		"recommended_next_steps": []string{
			"Confirmar se os materiais enviados representam preços e ofertas atuais.",
			"Definir perguntas obrigatórias de qualificação para Clara e Marcos.",
			"Mapear regras de orçamento com exemplos reais antes de automatizar cálculo.",
			"Escolher quais sistemas precisam integração depois da revisão interna.",
		},
	}
	summary := map[string]any{
		"title":    "Resumo da Clara",
		"headline": fmt.Sprintf("Entendi a base da %s e já existe material suficiente para uma primeira revisão.", intake.CompanyName),
		"highlights": []string{
			"Oferta principal: " + valueOr(offer, "a confirmar"),
			"Canais atuais: " + strings.Join(channels, ", "),
			"Pontos de melhoria: " + strings.Join(pains, ", "),
		},
		"next_steps": []string{
			"Revisar o resumo e confirmar o envio.",
			"Nosso time interno analisará o relatório completo.",
			"Nenhum agente será alterado automaticamente nesta etapa.",
		},
	}
	return mustJSON(report), mustJSON(summary)
}

func missingIntakeData(intake *store.CompanyIntake, answers map[string]any) []string {
	var missing []string
	if strings.TrimSpace(intake.ContactEmail) == "" {
		missing = append(missing, "E-mail de contato")
	}
	for key, label := range map[string]string{
		"budget_rules": "Exemplos de cálculo ou orçamento",
		"brand_soul":   "Tom, valores e diferenciais da empresa",
		"systems":      "Onde ficam clientes, pedidos, agenda ou produtos",
	} {
		v := strings.TrimSpace(fmt.Sprint(answers[key]))
		if v == "" || v == "<nil>" || v == "[]" {
			missing = append(missing, label)
		}
	}
	return missing
}

func asStrings(v any) []string {
	items, ok := v.([]any)
	if !ok {
		text := strings.TrimSpace(fmt.Sprint(v))
		if text == "" || text == "<nil>" {
			return []string{}
		}
		return []string{text}
	}
	out := make([]string, 0, len(items))
	for _, item := range items {
		text := strings.TrimSpace(fmt.Sprint(item))
		if text != "" {
			out = append(out, text)
		}
	}
	return out
}

func valueOr(v, fallback string) string {
	if strings.TrimSpace(v) == "" || v == "<nil>" {
		return fallback
	}
	return v
}

func mustJSON(v any) json.RawMessage {
	out, _ := json.Marshal(v)
	return out
}
