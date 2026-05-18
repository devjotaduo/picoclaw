import type { ReactNode } from "react";

interface PageHeaderProps {
  title: string;
  description?: string;
  titleExtra?: ReactNode;
  children?: ReactNode;
}

export function PageHeader({ title, description, titleExtra, children }: PageHeaderProps) {
  return (
    <header className="flex shrink-0 flex-wrap items-end justify-between gap-3 border-b border-zinc-800 bg-zinc-950 px-4 py-3 lg:px-6">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <h1 className="truncate text-lg font-semibold text-zinc-100">{title}</h1>
          {titleExtra}
        </div>
        {description && (
          <p className="mt-1 text-xs text-zinc-500">{description}</p>
        )}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </header>
  );
}
