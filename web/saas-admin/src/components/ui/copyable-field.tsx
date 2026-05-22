import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "./button";

// CopyableField renders the "label + monospace box + copy button" pattern
// that's repeated 10+ times across the tenant detail dialogs (passwords,
// magic links, dashboard URLs, invite tokens, ...). Centralizing it
// keeps the copy-feedback timing consistent and removes the three- or
// four-line useState dance from every caller.
//
// Variants tweak typography for the two common cases:
//   - "default": password / email / short URL (xs font)
//   - "tight":   long URLs that need to wrap aggressively (10px font)
//
// `accent="emerald"` paints the value greenish to flag it as the
// preferred copy target when several values are shown together.

export type CopyableFieldProps = {
  label: string;
  value: string;
  variant?: "default" | "tight";
  accent?: "default" | "emerald";
  hint?: string;
  warning?: string;
};

export function CopyableField({
  label,
  value,
  variant = "default",
  accent = "default",
  hint,
  warning,
}: CopyableFieldProps) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const codeBase = "flex-1 break-all rounded bg-zinc-950 px-3 py-2 font-mono";
  const codeSize = variant === "tight" ? "text-[10px]" : "text-xs";
  const codeColor = accent === "emerald" ? "text-emerald-200" : "text-zinc-100";
  const labelColor = accent === "emerald" ? "text-emerald-400" : "text-zinc-400";

  return (
    <div>
      <label className={`mb-1 block text-xs uppercase tracking-wider ${labelColor}`}>{label}</label>
      <div className="flex items-center gap-2">
        <code className={`${codeBase} ${codeSize} ${codeColor}`}>{value}</code>
        <Button variant="secondary" size="icon" onClick={handleCopy}>
          {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
        </Button>
      </div>
      {hint && <p className="mt-1 text-xs text-zinc-500">{hint}</p>}
      {warning && <p className="mt-1 text-xs text-amber-300">{warning}</p>}
    </div>
  );
}
