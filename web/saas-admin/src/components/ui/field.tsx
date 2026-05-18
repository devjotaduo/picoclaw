import { cn } from "@/lib/utils";
import type { ComponentProps } from "react";

export function Field({ className, ...props }: ComponentProps<"div">) {
  return <div data-slot="field" className={cn("flex flex-col gap-2", className)} {...props} />;
}

export function FieldLabel({ className, ...props }: ComponentProps<"label">) {
  return (
    <label
      data-slot="field-label"
      className={cn("text-sm font-medium text-zinc-200", className)}
      {...props}
    />
  );
}

export function FieldDescription({ className, ...props }: ComponentProps<"p">) {
  return (
    <p
      data-slot="field-description"
      className={cn("text-xs text-zinc-500", className)}
      {...props}
    />
  );
}
