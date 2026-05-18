import { useEffect, useRef } from "react";
import { Send } from "lucide-react";
import { TextField } from "../../components/Field";
import { cn } from "@/lib/utils";
import type { Basic, BasicErrors, TouchedBasic } from "../../types";

type Props = {
  basic: Basic;
  patchBasic: (patch: Partial<Basic>) => void;
  errors: BasicErrors;
  touched: TouchedBasic;
  touchField: (key: keyof Basic) => void;
  busy: boolean;
  onSubmit: () => void;
};

export function FormComposer({
  basic,
  patchBasic,
  errors,
  touched,
  touchField,
  busy,
  onSubmit,
}: Props) {
  const firstFieldRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    firstFieldRef.current?.focus({ preventScroll: true });
  }, []);

  const errorFor = (key: keyof Basic) => (touched[key] ? errors[key] : undefined);
  const validFor = (key: keyof Basic) =>
    Boolean(basic[key]?.trim()) && touched[key] && !errors[key];

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (busy) return;
        onSubmit();
      }}
      className="space-y-3 rounded-2xl border border-zinc-200 bg-white p-3.5 shadow-sm sm:p-4"
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <TextField
          ref={firstFieldRef}
          label="Empresa"
          name="organization"
          autoComplete="organization"
          enterKeyHint="next"
          value={basic.company_name}
          onChange={(event) => patchBasic({ company_name: event.target.value })}
          onBlur={() => touchField("company_name")}
          placeholder="Tech Solutions Brasil"
          error={errorFor("company_name")}
          showValid={validFor("company_name")}
        />
        <TextField
          label="Responsável"
          name="name"
          autoComplete="name"
          enterKeyHint="next"
          value={basic.contact_name}
          onChange={(event) => patchBasic({ contact_name: event.target.value })}
          onBlur={() => touchField("contact_name")}
          placeholder="Carlos Silva"
          error={errorFor("contact_name")}
          showValid={validFor("contact_name")}
        />
        <TextField
          label="E-mail"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          enterKeyHint="next"
          autoCapitalize="none"
          spellCheck={false}
          value={basic.contact_email}
          onChange={(event) => patchBasic({ contact_email: event.target.value })}
          onBlur={() => touchField("contact_email")}
          placeholder="carlos@empresa.com"
          error={errorFor("contact_email")}
          showValid={validFor("contact_email")}
        />
        <TextField
          label="WhatsApp"
          name="phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          enterKeyHint="next"
          value={basic.contact_whatsapp}
          onChange={(event) => patchBasic({ contact_whatsapp: event.target.value })}
          onBlur={() => touchField("contact_whatsapp")}
          placeholder="(11) 99999-9999"
          error={errorFor("contact_whatsapp")}
          showValid={validFor("contact_whatsapp")}
        />
        <TextField
          label="Cidade / região"
          name="city"
          autoComplete="address-level2"
          enterKeyHint="next"
          value={basic.city_region}
          onChange={(event) => patchBasic({ city_region: event.target.value })}
          onBlur={() => touchField("city_region")}
          placeholder="São Paulo, SP"
          optional
        />
        <TextField
          label="Site ou Instagram"
          name="url"
          inputMode="url"
          autoComplete="url"
          enterKeyHint="done"
          autoCapitalize="none"
          spellCheck={false}
          value={basic.site_instagram}
          onChange={(event) => patchBasic({ site_instagram: event.target.value })}
          onBlur={() => touchField("site_instagram")}
          placeholder="site.com.br ou @perfil"
          optional
          error={errorFor("site_instagram")}
        />
      </div>

      <p className="text-xs text-zinc-500">
        E-mail <strong>ou</strong> WhatsApp — basta um para retomar o cadastro.
      </p>

      <button
        type="submit"
        disabled={busy}
        className={cn(
          "inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-brand-600 px-4 text-sm font-semibold text-white shadow-sm",
          "transition-all active:scale-[0.99] disabled:opacity-60",
          "focus:outline-none focus-visible:ring-4 focus-visible:ring-brand-500/30",
        )}
      >
        <Send className="h-4 w-4" />
        Enviar e seguir
      </button>
    </form>
  );
}
