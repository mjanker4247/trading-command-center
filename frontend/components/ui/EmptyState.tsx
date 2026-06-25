import Link from "next/link";
import type { LucideIcon } from "lucide-react";

type EmptyStateAction = {
  label: string;
  href?: string;
  onClick?: () => void;
};

type EmptyStateProps = {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: EmptyStateAction;
  className?: string;
};

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className = "",
}: EmptyStateProps) {
  return (
    <div
      className={`flex flex-col items-center justify-center rounded-lg border border-border bg-surface px-6 py-10 text-center ${className}`.trim()}
    >
      <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-elevated text-muted">
        <Icon className="h-5 w-5" aria-hidden />
      </div>
      <h3 className="text-sm font-medium text-fg">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-xs text-muted">{description}</p>}
      {action && (
        <div className="mt-4">
          {action.href ? (
            <Link
              href={action.href}
              className="inline-flex items-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-fg hover:bg-blue-500"
            >
              {action.label}
            </Link>
          ) : (
            <button
              type="button"
              onClick={action.onClick}
              className="inline-flex items-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-fg hover:bg-blue-500"
            >
              {action.label}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
