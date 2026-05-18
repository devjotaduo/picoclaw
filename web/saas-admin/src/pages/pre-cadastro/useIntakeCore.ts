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
import { STORAGE_KEY } from "./constants";
import {
  errorMessage,
  maskPhone,
  normalizeHydratedAnswers,
  syncResumeUrl,
  toStringArray,
  withBusinessType,
} from "./helpers";
import { buildPublicSummaryPreview } from "./summary";
import { emptyBasic, type Basic, type SummaryPreview } from "./types";

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

export type IntakeCore = {
  intake: CompanyIntake | null;
  resumeToken: string;
  basic: Basic;
  setBasic: (next: Basic) => void;
  patchBasic: (patch: Partial<Basic>) => void;
  answers: Record<string, unknown>;
  setAnswers: (next: Record<string, unknown>) => void;
  toggleAnswer: (key: string, value: string) => void;
  updateAnswer: (key: string, value: unknown) => void;
  transcript: string;
  setTranscript: (next: string) => void;
  busy: boolean;
  listening: boolean;
  draftSavedAt: number | null;
  submitted: boolean;
  hasSummary: boolean;
  previewSummary: SummaryPreview;
  hydrated: boolean;
  persist: () => Promise<CompanyIntake | null>;
  upload: (file: File, kind: string) => Promise<CompanyIntake | null>;
  generateReport: () => Promise<CompanyIntake | null>;
  submit: () => Promise<CompanyIntake | null>;
  startSpeech: (
    onResult: (text: string) => void,
    onError: (message: string) => void,
  ) => boolean;
};

export function useIntakeCore(): IntakeCore {
  const [intake, setIntake] = useState<CompanyIntake | null>(null);
  const [resumeToken, setResumeToken] = useState("");
  const [basic, setBasicState] = useState<Basic>(emptyBasic);
  const [answers, setAnswersState] = useState<Record<string, unknown>>({});
  const [transcript, setTranscript] = useState("");
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [draftSavedAt, setDraftSavedAt] = useState<number | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get("id");
    const token = params.get("token");
    const saved = localStorage.getItem(STORAGE_KEY);
    const parsed = saved ? (JSON.parse(saved) as { id?: string; token?: string }) : {};
    const resumeId = id ?? parsed.id;
    const resume = token ?? parsed.token;
    if (!resumeId || !resume) {
      setHydrated(true);
      return;
    }
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
        setAnswersState(normalizeHydratedAnswers(data.answers ?? {}));
        setTranscript(data.audio_transcript ?? "");
      })
      .catch(() => localStorage.removeItem(STORAGE_KEY))
      .finally(() => setHydrated(true));
  }, []);

  const submitted = useMemo(
    () => Boolean(intake && SUBMITTED_STATUSES.has(intake.status)),
    [intake],
  );
  const hasSummary = useMemo(
    () =>
      intake?.status === "report_ready" ||
      Boolean(intake?.public_summary && Object.keys(intake.public_summary).length > 0),
    [intake?.public_summary, intake?.status],
  );
  const previewSummary = useMemo(
    () =>
      buildPublicSummaryPreview(
        intake?.public_summary,
        basic,
        answers,
        intake?.attachments ?? [],
        transcript,
      ),
    [answers, basic, intake?.attachments, intake?.public_summary, transcript],
  );

  const setBasic = useCallback((next: Basic) => setBasicState(next), []);
  const patchBasic = useCallback(
    (patch: Partial<Basic>) => setBasicState((prev) => ({ ...prev, ...patch })),
    [],
  );
  const setAnswers = useCallback((next: Record<string, unknown>) => setAnswersState(next), []);

  const toggleAnswer = useCallback((key: string, value: string) => {
    setAnswersState((prev) => {
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
    setAnswersState((prev) => ({ ...prev, [key]: value }));
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

  const normalizeForSave = useCallback(
    (current: Record<string, unknown>, currentBasic: Basic) =>
      withBusinessType({
        ...current,
        city_region: currentBasic.city_region,
        site_instagram: currentBasic.site_instagram,
      }),
    [],
  );

  const persist = useCallback(async (): Promise<CompanyIntake | null> => {
    try {
      setBusy(true);
      const { intake: current, token } = await ensureIntake();
      const saved = await savePublicIntake({
        id: current.id,
        resume_token: token,
        company_name: basic.company_name,
        contact_name: basic.contact_name,
        contact_email: basic.contact_email,
        contact_whatsapp: basic.contact_whatsapp,
        answers: normalizeForSave(answers, basic),
        audio_transcript: transcript,
      });
      setIntake(saved);
      setDraftSavedAt(Date.now());
      return saved;
    } catch {
      return null;
    } finally {
      setBusy(false);
    }
  }, [answers, basic, ensureIntake, normalizeForSave, transcript]);

  // Debounced auto-save after first persist.
  const firstPersistDone = useRef(false);
  useEffect(() => {
    if (!intake || !resumeToken) return;
    if (!firstPersistDone.current) {
      firstPersistDone.current = true;
      return;
    }
    const handle = window.setTimeout(() => {
      void persist();
    }, 1200);
    return () => window.clearTimeout(handle);
  }, [answers, basic, transcript, intake, resumeToken, persist]);

  const upload = useCallback(
    async (file: File, kind: string): Promise<CompanyIntake | null> => {
      try {
        setBusy(true);
        await persist();
        const { intake: current, token } = await ensureIntake();
        const updated = await uploadPublicIntakeAttachment({
          id: current.id,
          resume_token: token,
          kind,
          file,
        });
        setIntake(updated);
        setDraftSavedAt(Date.now());
        return updated;
      } catch (e) {
        throw new Error(errorMessage(e));
      } finally {
        setBusy(false);
      }
    },
    [ensureIntake, persist],
  );

  const generateReport = useCallback(async (): Promise<CompanyIntake | null> => {
    try {
      setBusy(true);
      await persist();
      const { intake: current, token } = await ensureIntake();
      const generated = await generatePublicIntakeReport(current.id, token);
      setIntake(generated);
      setDraftSavedAt(Date.now());
      return generated;
    } catch (e) {
      throw new Error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }, [ensureIntake, persist]);

  const submit = useCallback(async (): Promise<CompanyIntake | null> => {
    try {
      setBusy(true);
      const { intake: current, token } = await ensureIntake();
      const done = await submitPublicIntake(current.id, token);
      setIntake(done);
      return done;
    } catch (e) {
      throw new Error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }, [ensureIntake]);

  const startSpeech = useCallback(
    (onResult: (text: string) => void, onError: (message: string) => void) => {
      const win = window as unknown as {
        SpeechRecognition?: new () => SpeechRecognitionLike;
        webkitSpeechRecognition?: new () => SpeechRecognitionLike;
      };
      const Speech = win.SpeechRecognition || win.webkitSpeechRecognition;
      if (!Speech) return false;
      setListening(true);
      const recognition = new Speech();
      recognition.lang = "pt-BR";
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.onresult = async (event) => {
        const text = String(event.results?.[0]?.[0]?.transcript ?? "").trim();
        if (text) {
          const next = [transcript, text].filter(Boolean).join(" ");
          setTranscript(next);
          try {
            const { intake: current, token } = await ensureIntake();
            const updated = await savePublicIntakeTranscript(current.id, token, next);
            setIntake(updated);
            setDraftSavedAt(Date.now());
          } catch {
            /* leave the transcript in the textarea */
          }
          onResult(text);
        }
      };
      recognition.onerror = () => {
        setListening(false);
        onError("Não consegui transcrever agora. Você pode escrever no campo abaixo.");
      };
      recognition.onend = () => setListening(false);
      recognition.start();
      return true;
    },
    [ensureIntake, transcript],
  );

  return {
    intake,
    resumeToken,
    basic,
    setBasic,
    patchBasic,
    answers,
    setAnswers,
    toggleAnswer,
    updateAnswer,
    transcript,
    setTranscript,
    busy,
    listening,
    draftSavedAt,
    submitted,
    hasSummary,
    previewSummary,
    hydrated,
    persist,
    upload,
    generateReport,
    submit,
    startSpeech,
  };
}
