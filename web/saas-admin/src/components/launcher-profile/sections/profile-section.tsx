import { Field, SwitchCardField } from "@/components/shared-form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

import type { LauncherProfileForm } from "@/lib/launcher-profile-form";
import { SectionCard } from "@/components/launcher-profile/section-card";

interface ProfileSectionProps {
  form: LauncherProfileForm;
  onChange: <K extends keyof LauncherProfileForm>(key: K, value: LauncherProfileForm[K]) => void;
}

export function ProfileSection({ form, onChange }: ProfileSectionProps) {
  return (
    <SectionCard
      title="Identificação do perfil"
      description="Como o perfil aparece no painel admin e se ele é o padrão para novos tenants."
      defaultOpen
    >
      <Field
        label="Nome"
        hint="Texto exibido na listagem do admin. Pode ter espaços e acentos."
        layout="setting-row"
      >
        <Input value={form.name} onChange={(e) => onChange("name", e.target.value)} />
      </Field>
      <Field
        label="Slug"
        hint="Identificador estável usado em URLs e backups. Apenas letras minúsculas, números e hífens."
        layout="setting-row"
      >
        <Input
          value={form.slug}
          onChange={(e) => onChange("slug", e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"))}
        />
      </Field>
      <Field
        label="Descrição"
        hint="Anotação interna do operador. Não aparece para o cliente final."
        layout="setting-row"
      >
        <Textarea
          rows={3}
          value={form.description}
          onChange={(e) => onChange("description", e.target.value)}
        />
      </Field>
      <SwitchCardField
        label="Perfil padrão"
        hint="Quando ligado, todo tenant criado a partir de agora recebe este perfil automaticamente."
        checked={form.isDefault}
        onCheckedChange={(checked) => onChange("isDefault", checked)}
      />
    </SectionCard>
  );
}
