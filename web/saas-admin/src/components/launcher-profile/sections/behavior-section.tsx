import { Field, SwitchCardField } from "@/components/shared-form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";

import { SectionCard } from "@/components/launcher-profile/section-card";
import type { BehaviorForm, Weekday } from "@/lib/launcher-profile-form";
import { WEEKDAYS } from "@/lib/launcher-profile-form";

const WEEKDAY_LABELS: Record<Weekday, string> = {
  monday: "Segunda",
  tuesday: "Terça",
  wednesday: "Quarta",
  thursday: "Quinta",
  friday: "Sexta",
  saturday: "Sábado",
  sunday: "Domingo",
};

interface BehaviorSectionProps {
  value: BehaviorForm;
  onChange: (next: BehaviorForm) => void;
}

export function BehaviorSection({ value, onChange }: BehaviorSectionProps) {
  const update = <K extends keyof BehaviorForm>(key: K, v: BehaviorForm[K]) =>
    onChange({ ...value, [key]: v });

  const updateDay = (day: Weekday, patch: Partial<BehaviorForm["schedule"][Weekday]>) =>
    onChange({
      ...value,
      schedule: { ...value.schedule, [day]: { ...value.schedule[day], ...patch } },
    });

  return (
    <SectionCard
      title="Comportamento"
      description="Filtros aplicados antes do agente processar mensagens recebidas."
    >
      <SwitchCardField
        label="Master switch"
        hint="Quando desligado, o agente não responde em nenhum canal — útil para colocar o tenant em pausa."
        checked={value.masterEnabled}
        onCheckedChange={(v) => update("masterEnabled", v)}
      />
      <SwitchCardField
        label="Responder em DM"
        hint="Permite que o agente responda mensagens diretas (1:1)."
        checked={value.respondInDM}
        onCheckedChange={(v) => update("respondInDM", v)}
      />
      <SwitchCardField
        label="Responder em grupos"
        hint="Permite que o agente responda em conversas com mais de duas pessoas."
        checked={value.respondInGroups}
        onCheckedChange={(v) => update("respondInGroups", v)}
      />
      <SwitchCardField
        label="Em grupos, só com menção"
        hint="Quando ligado, em grupos o agente responde apenas se for mencionado (@bot ou nome)."
        checked={value.groupMentionOnly}
        onCheckedChange={(v) => update("groupMentionOnly", v)}
      />
      <SwitchCardField
        label="Modo somente saída"
        hint="Bloqueia mensagens recebidas — o agente só envia mensagens (campanhas, lembretes, etc.)."
        checked={value.outboundOnlyMode}
        onCheckedChange={(v) => update("outboundOnlyMode", v)}
      />
      <SwitchCardField
        label="Mascarar PII nas respostas"
        hint="Remove CPF, e-mail, telefone, etc., do que o agente devolve ao usuário."
        checked={value.maskPIIInReplies}
        onCheckedChange={(v) => update("maskPIIInReplies", v)}
      />

      <div className="py-4">
        <Separator />
      </div>

      <SwitchCardField
        label="Ignorar outros bots"
        hint="Evita loops: mensagens vindas de outros bots conhecidos são descartadas."
        checked={value.ignoreOtherBots}
        onCheckedChange={(v) => update("ignoreOtherBots", v)}
      />
      <SwitchCardField
        label="Ignorar mensagens próprias"
        hint="Não responde a mensagens que o próprio agente enviou (algumas plataformas espelham)."
        checked={value.ignoreSelfMessages}
        onCheckedChange={(v) => update("ignoreSelfMessages", v)}
      />
      <SwitchCardField
        label="Ignorar mensagens encaminhadas"
        hint="Pula mensagens marcadas como 'encaminhada' — geralmente correntes ou spam."
        checked={value.ignoreForwardedMessages}
        onCheckedChange={(v) => update("ignoreForwardedMessages", v)}
      />

      <div className="py-4">
        <Separator />
      </div>

      <SwitchCardField
        label="Processar áudio"
        hint="Transcreve áudios recebidos antes de enviar ao modelo."
        checked={value.processAudio}
        onCheckedChange={(v) => update("processAudio", v)}
      />
      <SwitchCardField
        label="Processar documentos"
        hint="Extrai texto de PDFs e documentos enviados pelo usuário."
        checked={value.processDocuments}
        onCheckedChange={(v) => update("processDocuments", v)}
      />
      <SwitchCardField
        label="Processar imagens"
        hint="Envia imagens recebidas ao modelo (vision). Custo extra no provedor."
        checked={value.processImages}
        onCheckedChange={(v) => update("processImages", v)}
      />
      <SwitchCardField
        label="Processar localização"
        hint="Aceita pinos de localização enviados pelo usuário."
        checked={value.processLocation}
        onCheckedChange={(v) => update("processLocation", v)}
      />
      <SwitchCardField
        label="Processar stickers"
        hint="Aceita stickers (figurinhas). Geralmente são ignorados pelo agente."
        checked={value.processStickers}
        onCheckedChange={(v) => update("processStickers", v)}
      />
      <SwitchCardField
        label="Processar vídeo"
        hint="Aceita vídeos. Atenção: arquivos grandes podem demorar para transcrever."
        checked={value.processVideo}
        onCheckedChange={(v) => update("processVideo", v)}
      />
      <SwitchCardField
        label="Armazenar mídia recebida"
        hint="Salva localmente os arquivos enviados pelo usuário para auditoria."
        checked={value.storeReceivedMedia}
        onCheckedChange={(v) => update("storeReceivedMedia", v)}
      />

      <div className="py-4">
        <Separator />
      </div>

      <SwitchCardField
        label="Só responder em horário comercial"
        hint="Fora do expediente, o agente responde com uma mensagem de ausência. Configure o expediente abaixo."
        checked={value.businessHoursOnly}
        onCheckedChange={(v) => update("businessHoursOnly", v)}
      />

      <Field
        label="Horário de funcionamento"
        hint="Define os dias e horários em que o agente responde quando 'só horário comercial' está ligado."
        layout="default"
      >
        <div className="flex flex-col gap-2">
          {WEEKDAYS.map((day) => {
            const entry = value.schedule[day];
            return (
              <div
                key={day}
                className="grid grid-cols-[110px_auto_minmax(0,1fr)_minmax(0,1fr)] items-center gap-3 rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2"
              >
                <span className="text-sm text-zinc-300">{WEEKDAY_LABELS[day]}</span>
                <label className="flex items-center gap-2 text-xs text-zinc-500">
                  <input
                    type="checkbox"
                    checked={entry.open}
                    onChange={(e) => updateDay(day, { open: e.target.checked })}
                    className="size-4 accent-emerald-500"
                  />
                  Aberto
                </label>
                <Input
                  type="time"
                  value={entry.from}
                  onChange={(e) => updateDay(day, { from: e.target.value })}
                  disabled={!entry.open}
                />
                <Input
                  type="time"
                  value={entry.to}
                  onChange={(e) => updateDay(day, { to: e.target.value })}
                  disabled={!entry.open}
                />
              </div>
            );
          })}
        </div>
      </Field>

      <Field
        label="Observações do horário"
        hint="Texto adicional incluído na mensagem de ausência. Ex: 'Funcionamos feriados e finais de semana'."
        layout="setting-row"
      >
        <Textarea
          rows={2}
          value={value.scheduleNotes}
          onChange={(e) => update("scheduleNotes", e.target.value)}
        />
      </Field>
    </SectionCard>
  );
}
