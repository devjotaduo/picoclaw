import type { ReactNode } from "react";

import { Field as UiField, FieldLabel, FieldDescription } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

type FieldLayout = "default" | "setting-row";

interface FieldProps {
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: ReactNode;
  layout?: FieldLayout;
  controlClassName?: string;
}

export function Field({
  label,
  hint,
  error,
  required,
  children,
  layout = "default",
  controlClassName,
}: FieldProps) {
  if (layout === "setting-row") {
    return (
      <div className="flex flex-col gap-4 py-4 md:grid md:grid-cols-[280px_minmax(0,1fr)] md:items-center md:gap-8">
        <div className="w-full min-w-0">
          <FieldLabel className="leading-relaxed break-words whitespace-normal">
            {label}
            {required && <span className="ml-1 text-red-400">*</span>}
          </FieldLabel>
          {hint && (
            <FieldDescription className="mt-1 text-xs leading-relaxed break-words whitespace-normal">
              {hint}
            </FieldDescription>
          )}
        </div>
        <div className={cn("w-full md:max-w-[28rem] md:justify-self-end", controlClassName)}>
          {children}
        </div>
        {error && (
          <FieldDescription className="text-xs leading-normal text-red-400 md:col-start-2 md:justify-self-end">
            {error}
          </FieldDescription>
        )}
      </div>
    );
  }

  return (
    <UiField className="gap-2.5">
      <div className="space-y-1">
        <FieldLabel>
          {label}
          {required && <span className="ml-1 text-red-400">*</span>}
        </FieldLabel>
        {hint && <FieldDescription className="text-xs leading-normal">{hint}</FieldDescription>}
      </div>
      {children}
      {error && (
        <FieldDescription className="text-xs leading-normal text-red-400">{error}</FieldDescription>
      )}
    </UiField>
  );
}

interface SwitchCardFieldProps {
  label: string;
  hint?: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  layout?: FieldLayout;
}

export function SwitchCardField({
  label,
  hint,
  checked,
  onCheckedChange,
  disabled,
  layout = "setting-row",
}: SwitchCardFieldProps) {
  return (
    <Field label={label} hint={hint} layout={layout} controlClassName="md:justify-self-end">
      <div className="flex justify-end md:justify-start">
        <Switch checked={checked} onCheckedChange={onCheckedChange} disabled={disabled} />
      </div>
    </Field>
  );
}
