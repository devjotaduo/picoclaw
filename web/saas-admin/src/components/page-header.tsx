import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

interface PageHeaderProps {
  title: string;
  description?: string;
  titleExtra?: ReactNode;
  children?: ReactNode;
  className?: string;
}

export function PageHeader({ title, description, titleExtra, children, className }: PageHeaderProps) {
  return (
    <header className={cn("z-40 flex min-h-14 shrink-0 flex-wrap items-center justify-between gap-3 border-b border-border/60 bg-background/80 px-4 py-3 backdrop-blur lg:px-6", className)}>
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <h1 className="truncate text-xl font-medium tracking-tight text-foreground/90">{title}</h1>
          {titleExtra}
        </div>
        {description && (
          <p className="mt-1 text-xs text-muted-foreground">{description}</p>
        )}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </header>
  );
}
