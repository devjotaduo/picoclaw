import { cn } from "@/lib/utils";

export function Empty({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="empty"
      className={cn("flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed p-8 text-center", className)}
      {...props}
    />
  );
}

export function EmptyTitle({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="empty-title" className={cn("text-sm font-medium text-foreground", className)} {...props} />;
}

export function EmptyDescription({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="empty-description" className={cn("max-w-sm text-sm text-muted-foreground", className)} {...props} />;
}
