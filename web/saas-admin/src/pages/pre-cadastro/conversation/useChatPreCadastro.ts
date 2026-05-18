import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useIntakeCore } from "../useIntakeCore";
import { errorMessage, maskPhone, toStringArray } from "../helpers";
import { getBasicErrors } from "../validation";
import type { Basic, BasicErrors, SummaryPreview, TouchedBasic } from "../types";
import { SCRIPT, nextScriptIndex, type ScriptNode, type ScriptState } from "./script";

export type ChatMessage =
  | {
      kind: "clara";
      id: string;
      text: string;
    }
  | {
      kind: "user";
      id: string;
      text: string;
    }
  | {
      kind: "attachment";
      id: string;
      name: string;
      label: string;
    };

export type ChatStatus = "idle" | "typing" | "busy";

type AnswerPayload =
  | { kind: "intro" }
  | { kind: "form"; basic: Basic }
  | { kind: "chips"; values: string[] }
  | { kind: "text"; value: string }
  | { kind: "upload"; skipped?: boolean }
  | { kind: "voice"; transcript: string; skipped?: boolean }
  | { kind: "confirm" }
  | { kind: "skip" };

export type ChatController = {
  messages: ChatMessage[];
  status: ChatStatus;
  busy: boolean;
  listening: boolean;
  currentNode: ScriptNode | null;
  isFinished: boolean;
  basic: Basic;
  patchBasic: (patch: Partial<Basic>) => void;
  answers: Record<string, unknown>;
  toggleAnswer: (key: string, value: string) => void;
  basicErrors: BasicErrors;
  touched: TouchedBasic;
  touchField: (key: keyof Basic) => void;
  touchAllBasic: () => void;
  draftSavedAt: number | null;
  hydrated: boolean;
  attachments: { id: string; name: string; kind: string }[];
  uploadKind: string;
  setUploadKind: (next: string) => void;
  transcript: string;
  setTranscript: (next: string) => void;
  hasSummary: boolean;
  previewSummary: SummaryPreview;
  submitted: boolean;
  intakeId: string | null;
  errorBanner: string | null;
  dismissError: () => void;
  submitAnswer: (payload: AnswerPayload) => void;
  goBack: () => void;
  canGoBack: boolean;
  startSpeech: () => void;
  uploadFile: (file: File) => void;
};

const TYPING_PER_CHAR = 18;
const TYPING_MIN = 320;
const TYPING_MAX = 900;
const SUBSEQUENT_PAUSE = 220;

function typingDelay(text: string): number {
  return Math.min(TYPING_MAX, Math.max(TYPING_MIN, text.length * TYPING_PER_CHAR));
}

function summarizeChipAnswer(values: string[]): string {
  if (values.length === 0) return "(nenhum)";
  return values.join(" · ");
}

function summarizeBasic(basic: Basic): string {
  const lines = [
    basic.company_name && `Empresa: ${basic.company_name}`,
    basic.contact_name && `Responsável: ${basic.contact_name}`,
    basic.contact_email && `E-mail: ${basic.contact_email}`,
    basic.contact_whatsapp && `WhatsApp: ${basic.contact_whatsapp}`,
    basic.city_region && `Cidade: ${basic.city_region}`,
    basic.site_instagram && `Site: ${basic.site_instagram}`,
  ].filter(Boolean) as string[];
  return lines.join("\n");
}

export function useChatPreCadastro(): ChatController {
  const core = useIntakeCore();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [status, setStatus] = useState<ChatStatus>("idle");
  const [index, setIndex] = useState<number>(-1); // -1 = not yet introduced
  const [history, setHistory] = useState<number[]>([]);
  const [touched, setTouched] = useState<TouchedBasic>({});
  const [uploadKind, setUploadKind] = useState("catálogo");
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const initialIndexRef = useRef<number>(-1);
  const timeoutsRef = useRef<number[]>([]);

  const scriptState: ScriptState = useMemo(
    () => ({
      basic: {
        company_name: core.basic.company_name,
        contact_name: core.basic.contact_name,
        contact_email: core.basic.contact_email,
        contact_whatsapp: core.basic.contact_whatsapp,
      },
      answers: core.answers,
      attachmentsCount: core.intake?.attachments.length ?? 0,
      hasSummary: core.hasSummary,
    }),
    [core.basic, core.answers, core.intake?.attachments.length, core.hasSummary],
  );

  const basicErrors = useMemo(() => getBasicErrors(core.basic), [core.basic]);

  const pushMessage = useCallback((msg: ChatMessage) => {
    setMessages((prev) => [...prev, msg]);
  }, []);

  const playClaraPrompts = useCallback(
    (prompts: string[], onDone?: () => void) => {
      setStatus("typing");
      let cancelled = false;
      const run = async () => {
        for (let i = 0; i < prompts.length; i += 1) {
          await new Promise<void>((resolve) => {
            const handle = window.setTimeout(resolve, typingDelay(prompts[i]));
            timeoutsRef.current.push(handle);
          });
          if (cancelled) return;
          pushMessage({ kind: "clara", id: `clara-${Date.now()}-${i}`, text: prompts[i] });
          if (i < prompts.length - 1) {
            setStatus("typing");
            await new Promise<void>((resolve) => {
              const handle = window.setTimeout(resolve, SUBSEQUENT_PAUSE);
              timeoutsRef.current.push(handle);
            });
          }
        }
        setStatus("idle");
        onDone?.();
      };
      void run();
      return () => {
        cancelled = true;
      };
    },
    [pushMessage],
  );

  // Cleanup pending timeouts on unmount.
  useEffect(
    () => () => {
      timeoutsRef.current.forEach((handle) => window.clearTimeout(handle));
      timeoutsRef.current = [];
    },
    [],
  );

  // Boot conversation once hydration finishes.
  useEffect(() => {
    if (!core.hydrated || initialIndexRef.current >= 0 || core.submitted) return;
    // If we already have basic data from resume, skip past identity-related nodes.
    let startIndex = 0;
    if (core.intake) {
      const errors = getBasicErrors(core.basic);
      if (Object.keys(errors).length === 0) {
        startIndex = 2; // skip intro + identity
      } else {
        startIndex = 1; // skip intro only
      }
    }
    initialIndexRef.current = startIndex;
    setIndex(startIndex);
    playClaraPrompts(SCRIPT[startIndex].prompts);
  }, [core.hydrated, core.intake, core.basic, core.submitted, playClaraPrompts]);

  // When intake is submitted, push a final celebratory message once.
  const submittedSyncedRef = useRef(false);
  useEffect(() => {
    if (!core.submitted || submittedSyncedRef.current) return;
    submittedSyncedRef.current = true;
    setMessages((prev) => [
      ...prev,
      {
        kind: "clara",
        id: `clara-done-${Date.now()}`,
        text: "Pronto! Seu pré-cadastro foi enviado com sucesso. 🎉 A equipe vai analisar o relatório completo e voltar com você em breve.",
      },
    ]);
    setStatus("idle");
  }, [core.submitted]);

  const advanceTo = useCallback(
    (nextIndex: number) => {
      if (nextIndex >= SCRIPT.length) return;
      setIndex(nextIndex);
      playClaraPrompts(SCRIPT[nextIndex].prompts);
    },
    [playClaraPrompts],
  );

  const touchField = useCallback((key: keyof Basic) => {
    setTouched((prev) => (prev[key] ? prev : { ...prev, [key]: true }));
  }, []);

  const touchAllBasic = useCallback(() => {
    setTouched({
      company_name: true,
      contact_name: true,
      contact_email: true,
      contact_whatsapp: true,
      city_region: true,
      site_instagram: true,
    });
  }, []);

  const goBack = useCallback(() => {
    if (history.length === 0) return;
    const lastIndex = history[history.length - 1];
    setHistory((prev) => prev.slice(0, -1));
    // Drop everything after the last clara prompt of the previous node:
    setMessages((prev) => {
      // Trim trailing messages until we find the prior node's last clara prompt.
      const node = SCRIPT[lastIndex];
      if (!node) return prev;
      const lastPrompt = node.prompts[node.prompts.length - 1];
      for (let i = prev.length - 1; i >= 0; i -= 1) {
        const candidate = prev[i];
        if (candidate.kind === "clara" && candidate.text === lastPrompt) {
          return prev.slice(0, i + 1);
        }
      }
      return prev;
    });
    setIndex(lastIndex);
  }, [history]);

  const submitAnswer = useCallback(
    async (payload: AnswerPayload) => {
      const node = SCRIPT[index];
      if (!node) return;

      // Record current index in history to allow going back.
      const recordHistory = () => setHistory((prev) => [...prev, index]);

      switch (payload.kind) {
        case "intro": {
          recordHistory();
          const next = nextScriptIndex(scriptState, index);
          advanceTo(next);
          return;
        }
        case "form": {
          touchAllBasic();
          const errors = getBasicErrors(payload.basic);
          if (Object.keys(errors).length > 0) {
            setErrorBanner("Revise os campos destacados antes de seguir.");
            return;
          }
          recordHistory();
          // sync basic into core (form already updated it live)
          pushMessage({
            kind: "user",
            id: `u-${Date.now()}`,
            text: summarizeBasic(payload.basic),
          });
          setStatus("busy");
          try {
            const saved = await core.persist();
            const ackText = node.ack?.({
              ...scriptState,
              basic: {
                company_name: payload.basic.company_name,
                contact_name: payload.basic.contact_name,
                contact_email: payload.basic.contact_email,
                contact_whatsapp: payload.basic.contact_whatsapp,
              },
            });
            if (ackText && saved) {
              await new Promise<void>((resolve) => {
                const handle = window.setTimeout(resolve, 300);
                timeoutsRef.current.push(handle);
              });
              pushMessage({ kind: "clara", id: `clara-ack-${Date.now()}`, text: ackText });
            }
          } catch (e) {
            setErrorBanner(errorMessage(e));
          } finally {
            setStatus("idle");
          }
          const next = nextScriptIndex(scriptState, index);
          advanceTo(next);
          return;
        }
        case "chips": {
          if (node.composer.kind !== "chips") return;
          if (payload.values.length < node.composer.min) {
            setErrorBanner(
              node.composer.min === 1
                ? "Selecione pelo menos uma opção."
                : `Selecione pelo menos ${node.composer.min} opções.`,
            );
            return;
          }
          recordHistory();
          pushMessage({
            kind: "user",
            id: `u-${Date.now()}`,
            text: summarizeChipAnswer(payload.values),
          });
          const next = nextScriptIndex(scriptState, index);
          advanceTo(next);
          return;
        }
        case "text": {
          if (node.composer.kind !== "text") return;
          const value = payload.value.trim();
          if (!value && !node.composer.optional) {
            setErrorBanner(node.composer.requiredMessage ?? "Por favor, preencha esse campo.");
            return;
          }
          if (value) {
            recordHistory();
            pushMessage({ kind: "user", id: `u-${Date.now()}`, text: value });
          } else {
            recordHistory();
            pushMessage({
              kind: "user",
              id: `u-${Date.now()}`,
              text: "(pulei essa)",
            });
          }
          const next = nextScriptIndex(scriptState, index);
          advanceTo(next);
          return;
        }
        case "upload": {
          recordHistory();
          if (!payload.skipped && core.intake?.attachments.length) {
            // a message was already appended via uploadFile
          } else {
            pushMessage({
              kind: "user",
              id: `u-${Date.now()}`,
              text: "Sem material por agora",
            });
          }
          const ackText = node.ack?.(scriptState);
          if (ackText) {
            pushMessage({ kind: "clara", id: `clara-ack-${Date.now()}`, text: ackText });
          }
          const next = nextScriptIndex(scriptState, index);
          advanceTo(next);
          return;
        }
        case "voice": {
          recordHistory();
          if (payload.transcript.trim()) {
            pushMessage({ kind: "user", id: `u-${Date.now()}`, text: payload.transcript });
          } else {
            pushMessage({ kind: "user", id: `u-${Date.now()}`, text: "Sem complemento" });
          }
          const next = nextScriptIndex(scriptState, index);
          advanceTo(next);
          return;
        }
        case "confirm": {
          if (node.composer.kind !== "confirm") return;
          recordHistory();
          if (node.composer.action === "generate") {
            pushMessage({ kind: "user", id: `u-${Date.now()}`, text: "Pode gerar o resumo" });
            setStatus("busy");
            try {
              await core.generateReport();
              const next = nextScriptIndex(scriptState, index);
              advanceTo(next);
            } catch (e) {
              setErrorBanner(errorMessage(e));
            } finally {
              setStatus("idle");
            }
          } else {
            pushMessage({ kind: "user", id: `u-${Date.now()}`, text: "Confirmar envio" });
            setStatus("busy");
            try {
              await core.submit();
            } catch (e) {
              setErrorBanner(errorMessage(e));
            } finally {
              setStatus("idle");
            }
          }
          return;
        }
        case "skip": {
          if (!node.skippable) return;
          recordHistory();
          pushMessage({ kind: "user", id: `u-${Date.now()}`, text: "Vou pular essa" });
          const next = nextScriptIndex(scriptState, index);
          advanceTo(next);
          return;
        }
      }
    },
    [advanceTo, core, index, pushMessage, scriptState, touchAllBasic],
  );

  const uploadFile = useCallback(
    async (file: File) => {
      setStatus("busy");
      setErrorBanner(null);
      try {
        const updated = await core.upload(file, uploadKind);
        const attachment = updated?.attachments.at(-1);
        if (attachment) {
          pushMessage({
            kind: "attachment",
            id: `a-${attachment.id}`,
            name: attachment.name,
            label: attachment.kind,
          });
        }
      } catch (e) {
        setErrorBanner(errorMessage(e));
      } finally {
        setStatus("idle");
      }
    },
    [core, pushMessage, uploadKind],
  );

  const startSpeech = useCallback(() => {
    const ok = core.startSpeech(
      (text) => {
        pushMessage({ kind: "user", id: `u-voice-${Date.now()}`, text });
      },
      (msg) => setErrorBanner(msg),
    );
    if (!ok) {
      setErrorBanner(
        "Seu navegador não tem transcrição automática aqui. Você pode escrever no campo abaixo.",
      );
    }
  }, [core, pushMessage]);

  const currentNode = index >= 0 ? SCRIPT[index] : null;
  const isFinished = core.submitted;

  return {
    messages,
    status: core.busy ? "busy" : status,
    busy: core.busy,
    listening: core.listening,
    currentNode,
    isFinished,
    basic: core.basic,
    patchBasic: (patch) => {
      if (patch.contact_whatsapp !== undefined) {
        core.patchBasic({ ...patch, contact_whatsapp: maskPhone(patch.contact_whatsapp) });
      } else {
        core.patchBasic(patch);
      }
    },
    answers: core.answers,
    toggleAnswer: core.toggleAnswer,
    basicErrors,
    touched,
    touchField,
    touchAllBasic,
    draftSavedAt: core.draftSavedAt,
    hydrated: core.hydrated,
    attachments: core.intake?.attachments ?? [],
    uploadKind,
    setUploadKind,
    transcript: core.transcript,
    setTranscript: core.setTranscript,
    hasSummary: core.hasSummary,
    previewSummary: core.previewSummary,
    submitted: core.submitted,
    intakeId: core.intake?.id ?? null,
    errorBanner,
    dismissError: () => setErrorBanner(null),
    submitAnswer,
    goBack,
    canGoBack: history.length > 0 && !core.submitted,
    startSpeech,
    uploadFile,
  };
}

// Avoid an unused warning when toStringArray is dropped by tree-shaking.
void toStringArray;
