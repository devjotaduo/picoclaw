import { cn } from "@/lib/utils";
import type { StepKey } from "../types";

type StepShellProps = {
  stepKey: StepKey;
  title: string;
  subtitle: string;
  children: React.ReactNode;
};

export function StepShell({ stepKey, title, subtitle, children }: StepShellProps) {
  return (
    <section
      key={stepKey}
      aria-labelledby={`step-${stepKey}-title`}
      className={cn(
        "space-y-5",
        "motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 motion-safe:duration-300",
      )}
    >
      <header className="space-y-1">
        <h2 id={`step-${stepKey}-title`} className="text-2xl font-semibold tracking-tight text-zinc-950 sm:text-3xl">
          {title}
        </h2>
        <p className="text-sm leading-6 text-zinc-600">{subtitle}</p>
      </header>
      {children}
    </section>
  );
}
