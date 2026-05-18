import { useState } from "react";

import { Field, SwitchCardField } from "@/components/shared-form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

import { SectionCard } from "@/components/launcher-profile/section-card";
import type { ChannelsForm } from "@/lib/launcher-profile-form";

interface ChannelsSectionProps {
  value: ChannelsForm;
  onChange: (next: ChannelsForm) => void;
}

export function ChannelsSection({ value, onChange }: ChannelsSectionProps) {
  const [raw, setRaw] = useState(false);
  const update = <K extends keyof ChannelsForm>(key: K, v: ChannelsForm[K]) =>
    onChange({ ...value, [key]: v });

  return (
    <SectionCard
      title="Canais"
      description="Plataformas onde o agente atende. WhatsApp, Telegram e Matrix têm campos visuais; demais ficam no JSON."
      rawMode={raw}
      onToggleRaw={setRaw}
      rawLabel="JSON dos demais"
    >
      {!raw ? (
        <>
          <SwitchCardField
            label="WhatsApp · ativo"
            hint="Liga a integração WhatsApp (whatsmeow nativo). Requer login via QR Code no launcher."
            checked={value.whatsapp.enabled}
            onCheckedChange={(v) => update("whatsapp", { ...value.whatsapp, enabled: v })}
          />
          <SwitchCardField
            label="WhatsApp · usar implementação nativa"
            hint="whatsmeow embarcado no binário. Desligue para usar uma bridge externa."
            checked={value.whatsapp.useNative}
            onCheckedChange={(v) => update("whatsapp", { ...value.whatsapp, useNative: v })}
          />
          <Field
            label="WhatsApp · URL da bridge"
            hint="Só usado quando 'usar nativa' está desligado. Apontar para o serviço externo."
            layout="setting-row"
          >
            <Input
              value={value.whatsapp.bridgeURL}
              onChange={(e) => update("whatsapp", { ...value.whatsapp, bridgeURL: e.target.value })}
            />
          </Field>

          <SwitchCardField
            label="Telegram · ativo"
            hint="Liga a integração Telegram (long-poll). Requer token do BotFather no launcher."
            checked={value.telegram.enabled}
            onCheckedChange={(v) => update("telegram", { ...value.telegram, enabled: v })}
          />
          <Field
            label="Telegram · base URL"
            hint="Vazio = api.telegram.org. Use somente se estiver atrás de proxy reverso/mirror."
            layout="setting-row"
          >
            <Input
              value={value.telegram.baseURL}
              onChange={(e) => update("telegram", { ...value.telegram, baseURL: e.target.value })}
            />
          </Field>
          <SwitchCardField
            label="Telegram · enviar 'digitando...'"
            hint="Mostra indicador 'digitando' enquanto o agente prepara a resposta."
            checked={value.telegram.typingEnabled}
            onCheckedChange={(v) => update("telegram", { ...value.telegram, typingEnabled: v })}
          />
          <SwitchCardField
            label="Telegram · MarkdownV2"
            hint="Renderiza respostas como MarkdownV2. Pode falhar se o texto tiver caracteres especiais não escapados."
            checked={value.telegram.useMarkdownV2}
            onCheckedChange={(v) => update("telegram", { ...value.telegram, useMarkdownV2: v })}
          />

          <SwitchCardField
            label="Matrix · ativo"
            hint="Liga a integração Matrix (websocket-like). Requer user_id e senha/token."
            checked={value.matrix.enabled}
            onCheckedChange={(v) => update("matrix", { ...value.matrix, enabled: v })}
          />
          <Field
            label="Matrix · homeserver"
            hint="URL do homeserver Matrix. Padrão público: https://matrix.org."
            layout="setting-row"
          >
            <Input
              value={value.matrix.homeserver}
              onChange={(e) => update("matrix", { ...value.matrix, homeserver: e.target.value })}
            />
          </Field>
          <Field
            label="Matrix · user ID"
            hint="Formato @bot:matrix.org. Não confunda com display name."
            layout="setting-row"
          >
            <Input
              value={value.matrix.userID}
              onChange={(e) => update("matrix", { ...value.matrix, userID: e.target.value })}
            />
          </Field>
          <SwitchCardField
            label="Matrix · entrar ao ser convidado"
            hint="Aceita automaticamente convites para rooms. Desligue se preferir aprovar manualmente."
            checked={value.matrix.joinOnInvite}
            onCheckedChange={(v) => update("matrix", { ...value.matrix, joinOnInvite: v })}
          />
          <SwitchCardField
            label="Matrix · em grupos só com menção"
            hint="Em rooms com 3+ participantes, só responde quando mencionado."
            checked={value.matrix.mentionOnly}
            onCheckedChange={(v) => update("matrix", { ...value.matrix, mentionOnly: v })}
          />
        </>
      ) : (
        <Field
          label="Demais canais (JSON)"
          hint="Discord, Slack, IRC, etc. Edição direta porque raramente são configurados pelo admin."
          layout="default"
        >
          <Textarea
            rows={20}
            value={value.othersJSON}
            onChange={(e) => update("othersJSON", e.target.value)}
            className="font-mono text-xs"
          />
        </Field>
      )}
    </SectionCard>
  );
}
