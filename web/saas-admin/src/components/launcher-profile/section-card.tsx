import * as Collapsible from "@radix-ui/react-collapsible";
import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface SectionCardProps {
  title: string;
  description?: string;
  defaultOpen?: boolean;
  rawMode?: boolean;
  onToggleRaw?: (next: boolean) => void;
  rawLabel?: string;
  children: ReactNode;
}

export function SectionCard({
  title,
  description,
  defaultOpen = false,
  rawMode,
  onToggleRaw,
  rawLabel = "JSON avançado",
  children,
}: SectionCardProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Collapsible.Root open={open} onOpenChange={setOpen}>
      <Card className="overflow-hidden">
        <CardHeader className="flex flex-row items-center justify-between gap-4 border-b border-zinc-800">
          <Collapsible.Trigger className="flex flex-1 items-start gap-3 text-left">
            <ChevronDown
              className={cn(
                "mt-0.5 size-4 shrink-0 text-zinc-500 transition-transform",
                open ? "rotate-0" : "-rotate-90",
              )}
            />
            <div className="min-w-0">
              <CardTitle>{title}</CardTitle>
              {description && (
                <p className="mt-1 text-xs text-zinc-500">{description}</p>
              )}
            </div>
          </Collapsible.Trigger>
          {onToggleRaw && (
            <div className="inline-flex rounded-md border border-zinc-800 bg-zinc-950 p-1">
              <button
                type="button"
                onClick={() => onToggleRaw(false)}
                className={cn(
                  "rounded px-2 py-1 text-[11px]",
                  !rawMode ? "bg-zinc-800 text-zinc-100" : "text-zinc-500 hover:text-zinc-200",
                )}
              >
                Visual
              </button>
              <button
                type="button"
                onClick={() => onToggleRaw(true)}
                className={cn(
                  "rounded px-2 py-1 text-[11px]",
                  rawMode ? "bg-zinc-800 text-zinc-100" : "text-zinc-500 hover:text-zinc-200",
                )}
              >
                {rawLabel}
              </button>
            </div>
          )}
        </CardHeader>
        <Collapsible.Content>
          <CardContent className="divide-y divide-zinc-800/60 py-0">{children}</CardContent>
        </Collapsible.Content>
      </Card>
    </Collapsible.Root>
  );
}
