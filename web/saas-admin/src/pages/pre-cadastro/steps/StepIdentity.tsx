import { useEffect, useRef } from "react";
import { TextField } from "../components/Field";
import { maskPhone } from "../helpers";
import type { Basic, BasicErrors, TouchedBasic } from "../types";

type StepIdentityProps = {
  basic: Basic;
  setBasic: (next: Basic) => void;
  errors: BasicErrors;
  touched: TouchedBasic;
  onBlur: (key: keyof Basic) => void;
};

export function StepIdentity({ basic, setBasic, errors, touched, onBlur }: StepIdentityProps) {
  const firstInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    firstInputRef.current?.focus({ preventScroll: true });
  }, []);

  const update = (key: keyof Basic, value: string) => setBasic({ ...basic, [key]: value });

  const errorFor = (key: keyof Basic) => (touched[key] ? errors[key] : undefined);
  const validFor = (key: keyof Basic) =>
    Boolean(basic[key]?.trim()) && touched[key] && !errors[key];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <TextField
          ref={firstInputRef}
          label="Empresa"
          name="organization"
          autoComplete="organization"
          enterKeyHint="next"
          inputMode="text"
          value={basic.company_name}
          onChange={(event) => update("company_name", event.target.value)}
          onBlur={() => onBlur("company_name")}
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
          onChange={(event) => update("contact_name", event.target.value)}
          onBlur={() => onBlur("contact_name")}
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
          onChange={(event) => update("contact_email", event.target.value)}
          onBlur={() => onBlur("contact_email")}
          placeholder="carlos@empresa.com"
          error={errorFor("contact_email")}
          showValid={validFor("contact_email")}
          hint="Usaremos para retomar o cadastro e confirmar."
        />
        <TextField
          label="WhatsApp"
          name="phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          enterKeyHint="next"
          value={basic.contact_whatsapp}
          onChange={(event) => update("contact_whatsapp", maskPhone(event.target.value))}
          onBlur={() => onBlur("contact_whatsapp")}
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
          onChange={(event) => update("city_region", event.target.value)}
          onBlur={() => onBlur("city_region")}
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
          onChange={(event) => update("site_instagram", event.target.value)}
          onBlur={() => onBlur("site_instagram")}
          placeholder="site.com.br ou @perfil"
          optional
          error={errorFor("site_instagram")}
        />
      </div>
      <p className="text-xs text-zinc-500">
        Use e-mail <strong>ou</strong> WhatsApp — basta um para manter o canal de retomada e confirmação.
      </p>
    </div>
  );
}
