import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createPublicIntake,
  generatePublicIntakeReport,
  getPublicIntake,
  savePublicIntake,
  savePublicIntakeTranscript,
  submitPublicIntake,
  uploadPublicIntakeAttachment,
  type CompanyIntake,
} from "@/api/company-intakes";
import { STEP_ORDER, STORAGE_KEY, type StepKey } from "./constants";
import {
  errorMessage,
  maskPhone,
  normalizeHydratedAnswers,
  syncResumeUrl,
  toStringArray,
  withBusinessType,
} from "./helpers";
import { getBasicErrors, getMinimumSubmissionMessage, getStepValidationMessage } from "./validation";
import { buildPublicSummaryPreview } from "./summary";
import { emptyBasic, type Basic, type SummaryPreview, type TouchedBasic } from "./types";

const SUBMITTED_STATUSES = new Set<CompanyIntake["status"]>(["submitted", "reviewed", "linked"]);

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: (event: { results?: ArrayLike<ArrayLike<{ transcript?: string }>> }) => void;
  onerror: () => void;
  onend: () => void;
  start: () => void;
};

export type NoticeState = { tone: "info" | "warning"; message: string } | null;

export type UsePreCadastroResult = {
  step: StepKey;
  stepIndex: number;
  furthestStepIndex: number;
  intake: CompanyIntake | null;
  resumeToken: string;
  basic: Basic;
  setBasic: (next: Basic) => void;
  answers: Record<string, unknown>;
  touched: TouchedBasic;
  touchField: (key: keyof Basic) => void;
  basicErrors: ReturnType<typeof getBasicErrors>;
  validationMessage: string;
  canUsePrimaryAction: boolean;
  busy: boolean;
  listening: boolean;
  notice: NoticeState;
  setNotice: (notice: NoticeState) => void;
  draftSavedAt: number | null;
  uploadKind: string;
  setUploadKind: (kind: string) => void;
  transcript: string;
  setTranscript: (transcript: string) => void;
  toggleAnswer: (key: string, value: string) => void;
  updateAnswer: (key: string, value: unknown) => void;
  next: () => void;
  back: () => void;
  generateReport: () => void;
  submit: () => void;
  upload: (file: File | null) => void;
  startSpeech: () => void;
  submitted: boolean;
  hasSummary: boolean;
  previewSummary: SummaryPreview;
};

export function usePreCadastro(): UsePreCadastroResult {
  const [intake, setIntake] = useState<CompanyIntake | null>(null);
  const [resumeToken, setResumeToken] = useState("");
  const [step, setStep] = useState<StepKey>("identity");
  const [furthestStepIndex, setFurthestStepIndex] = useState(0);
  const [basic, setBasicState] = useState<Basic>(emptyBasic);
  const [touched, setTouched] = useState<TouchedBasic>({});
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [uploadKind, setUploadKind] = useState("catálogo");
  const [transcript, setTranscript] = useState("");
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [notice, setNotice] = useState<NoticeState>(null);
  const [draftSavedAt, setDraftSavedAt] = useState<number | null>(null);

  // Hydrate from resume URL or localStorage on mount.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get("id");
    const token = params.get("token");
    const saved = localStorage.getItem(STORAGE_KEY);
    const parsed = saved ? (JSON.parse(saved) as { id?: string; token?: string }) : {};
    const resumeId = id ?? parsed.id;
    const resume = token ?? parsed.token;
    if (resumeId && resume) {
      void getPublicIntake(resumeId, resume)
        .then((data) => {
          setIntake(data);
          setResumeToken(resume);
          syncResumeUrl(data.id, resume);
          setBasicState({
            company_name: data.company_name ?? "",
            contact_name: data.contact_name ?? "",
            contact_email: data.contact_email ?? "",
            contact_whatsapp: maskPhone(data.contact_whatsapp ?? ""),
            city_region: String(data.answers?.city_region ?? ""),
            site_instagram: String(data.answers?.site_instagram ?? ""),
          });
          setAnswers(normalizeHydratedAnswers(data.answers ?? {}));
          setTranscript(data.audio_transcript ?? "");
        })
        .catch(() => localStorage.removeItem(STORAGE_KEY));
    }
  }, []);

  const submitted = useMemo(() => Boolean(intake && SUBMITTED_STATUSES.has(intake.status)), [intake]);
  const hasSummary = useMemo(
    () =>
      intake?.status === "report_ready" ||
      Boolean(intake?.public_summary && Object.keys(intake.public_summary).length > 0),
    [intake?.public_summary, intake?.status],
  );
  const basicErrors = useMemo(() => getBasicErrors(basic), [basic]);
  const validationMessage = useMemo(
    () => getStepValidationMessage(step, basic, answers),
    [answers, basic, step],
  );
  const previewSummary = useMemo(
    () => buildPublicSummaryPreview(intake?.public_summary, basic, answers, intake?.attachments ?? [], transcript),
    [answers, basic, intake?.attachments, intake?.public_summary, transcript],
  );
  const stepIndex = STEP_ORDER.indexOf(step);
  const canUsePrimaryAction = !busy && !validationMessage;

  const setBasic = useCallback((next: Basic) => setBasicState(next), []);

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

  const ensureIntake = useCallback(async () => {
    if (intake && resumeToken) {
      syncResumeUrl(intake.id, resumeToken);
      return { intake, token: resumeToken };
    }
    const created = await createPublicIntake();
    const token = created.resume_token ?? "";
    setIntake(created);
    setResumeToken(token);
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ id: created.id, token }));
    syncResumeUrl(created.id, token);
    return { intake: created, token };
  }, [intake, resumeToken]);

  const normalizeAnswersForSave = useCallback(
    (current: Record<string, unknown>, currentBasic: Basic) =>
      withBusinessType({
        ...current,
        city_region: currentBasic.city_region,
        site_instagram: currentBasic.site_instagram,
      }),
    [],
  );

  const persist = useCallback(
    async (
      nextAnswers = answers,
      nextBasic = basic,
      nextTranscript = transcript,
    ): Promise<CompanyIntake> => {
      const { intake: current, token } = await ensureIntake();
      const saved = await savePublicIntake({
        id: current.id,
        resume_token: token,
        company_name: nextBasic.company_name,
        contact_name: nextBasic.contact_name,
        contact_email: nextBasic.contact_email,
        contact_whatsapp: nextBasic.contact_whatsapp,
        answers: normalizeAnswersForSave(nextAnswers, nextBasic),
        audio_transcript: nextTranscript,
      });
      setIntake(saved);
      setDraftSavedAt(Date.now());
      return saved;
    },
    [answers, basic, ensureIntake, normalizeAnswersForSave, transcript],
  );

  // Auto-save when answers change (debounced), but only after the first persisted save.
  const firstPersistDone = useRef(false);
  useEffect(() => {
    if (!intake || !resumeToken) return;
    if (!firstPersistDone.current) {
      firstPersistDone.current = true;
      return;
    }
    const handle = window.setTimeout(() => {
      persist().catch(() => {
        /* surface only on explicit user action */
      });
    }, 1200);
    return () => window.clearTimeout(handle);
  }, [answers, basic, transcript, intake, resumeToken, persist]);

  const toggleAnswer = useCallback((key: string, value: string) => {
    setAnswers((prev) => {
      const current = toStringArray(prev[key]);
      const nextList = current.includes(value)
        ? current.filter((item) => item !== value)
        : [...current, value];
      const nextAnswers = { ...prev, [key]: nextList };
      if (key === "segments" || key === "business_models") {
        return withBusinessType(nextAnswers);
      }
      return nextAnswers;
    });
  }, []);

  const updateAnswer = useCallback((key: string, value: unknown) => {
    setAnswers((prev) => ({ ...prev, [key]: value }));
  }, []);

  const next = useCallback(() => {
    if (step === "identity") {
      touchAllBasic();
    }
    const message = getStepValidationMessage(step, basic, answers);
    if (message) {
      setNotice({ tone: "warning", message });
      return;
    }
    setBusy(true);
    setNotice(null);
    void persist()
      .then((saved) => {
        const currentIndex = STEP_ORDER.indexOf(step);
        const nextStep = STEP_ORDER[Math.min(currentIndex + 1, STEP_ORDER.length - 1)];
        setStep(nextStep);
        setFurthestStepIndex((current) => Math.max(current, currentIndex + 1));
        if (step === "identity") {
          const contact = basic.contact_email.trim();
          setNotice({
            tone: "info",
            message: contact
              ? `Rascunho salvo e vinculado a ${contact}. Você pode retomar pelo link na barra do navegador.`
              : `Rascunho salvo. Código ${saved.id}; o link de retomada já está na barra do navegador.`,
          });
        }
      })
      .catch((e) => setNotice({ tone: "warning", message: errorMessage(e) }))
      .finally(() => setBusy(false));
  }, [answers, basic, persist, step, touchAllBasic]);

  const back = useCallback(() => {
    setNotice(null);
    setStep((current) => {
      const currentIndex = STEP_ORDER.indexOf(current);
      return STEP_ORDER[Math.max(0, currentIndex - 1)];
    });
  }, []);

  const generateReport = useCallback(() => {
    const message = getMinimumSubmissionMessage(basic, answers);
    if (message) {
      setNotice({ tone: "warning", message });
      return;
    }
    setBusy(true);
    setNotice(null);
    void (async () => {
      try {
        await persist();
        const { intake: current, token } = await ensureIntake();
        const generated = await generatePublicIntakeReport(current.id, token);
        setIntake(generated);
        setStep("review");
        setNotice({
          tone: "info",
          message: "Resumo pronto. Revise os pontos entendidos antes de confirmar.",
        });
      } catch (e) {
        setNotice({ tone: "warning", message: errorMessage(e) });
      } finally {
        setBusy(false);
      }
    })();
  }, [answers, basic, ensureIntake, persist]);

  const submit = useCallback(() => {
    const message = getMinimumSubmissionMessage(basic, answers);
    if (message) {
      setNotice({ tone: "warning", message });
      return;
    }
    setBusy(true);
    setNotice(null);
    void (async () => {
      try {
        const { intake: current, token } = await ensureIntake();
        const done = await submitPublicIntake(current.id, token);
        setIntake(done);
      } catch (e) {
        setNotice({ tone: "warning", message: errorMessage(e) });
      } finally {
        setBusy(false);
      }
    })();
  }, [answers, basic, ensureIntake]);

  const upload = useCallback(
    (file: File | null) => {
      if (!file) return;
      setBusy(true);
      setNotice(null);
      void (async () => {
        try {
          await persist();
          const { intake: current, token } = await ensureIntake();
          const updated = await uploadPublicIntakeAttachment({
            id: current.id,
            resume_token: token,
            kind: uploadKind,
            file,
          });
          setIntake(updated);
          setNotice({
            tone: "info",
            message: `${file.name} foi recebido. Pode enviar outro ou continuar.`,
          });
        } catch (e) {
          setNotice({ tone: "warning", message: errorMessage(e) });
        } finally {
          setBusy(false);
        }
      })();
    },
    [ensureIntake, persist, uploadKind],
  );

  const startSpeech = useCallback(() => {
    // SpeechRecognition lives in browser-only types not bundled in TS lib.dom by default.
    const win = window as unknown as {
      SpeechRecognition?: new () => SpeechRecognitionLike;
      webkitSpeechRecognition?: new () => SpeechRecognitionLike;
    };
    const Speech = win.SpeechRecognition || win.webkitSpeechRecognition;
    if (!Speech) {
      setNotice({
        tone: "warning",
        message:
          "Seu navegador não oferece transcrição automática aqui. Você pode escrever um resumo no campo abaixo.",
      });
      return;
    }
    setListening(true);
    setNotice({
      tone: "info",
      message: "Transcrição iniciada. O áudio não fica gravado — só o texto entra no rascunho.",
    });
    const recognition = new Speech();
    recognition.lang = "pt-BR";
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.onresult = async (event) => {
      const text = event.results?.[0]?.[0]?.transcript ?? "";
      const nextTranscript = [transcript, text].filter(Boolean).join(" ");
      setTranscript(nextTranscript);
      try {
        const { intake: current, token } = await ensureIntake();
        const updated = await savePublicIntakeTranscript(current.id, token, nextTranscript);
        setIntake(updated);
        setNotice({ tone: "info", message: "Transcrição adicionada ao rascunho." });
      } catch {
        setNotice({
          tone: "warning",
          message: "Transcrevi, mas não consegui salvar agora. O texto ficou no campo abaixo.",
        });
      }
    };
    recognition.onerror = () => {
      setNotice({
        tone: "warning",
        message: "Não consegui transcrever agora. Você pode escrever o complemento no campo abaixo.",
      });
      setListening(false);
    };
    recognition.onend = () => setListening(false);
    recognition.start();
  }, [ensureIntake, transcript]);

  return {
    step,
    stepIndex,
    furthestStepIndex,
    intake,
    resumeToken,
    basic,
    setBasic,
    answers,
    touched,
    touchField,
    basicErrors,
    validationMessage,
    canUsePrimaryAction,
    busy,
    listening,
    notice,
    setNotice,
    draftSavedAt,
    uploadKind,
    setUploadKind,
    transcript,
    setTranscript,
    toggleAnswer,
    updateAnswer,
    next,
    back,
    generateReport,
    submit,
    upload,
    startSpeech,
    submitted,
    hasSummary,
    previewSummary,
  };
}
