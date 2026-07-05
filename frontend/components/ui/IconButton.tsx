"use client";

import Link from "next/link";
import type { ButtonHTMLAttributes } from "react";
import type { LucideIcon } from "lucide-react";
import { TOUCH_TARGET_ICON_CLASS } from "@/lib/uiClasses";

type IconTone = "default" | "primary" | "success" | "danger" | "warning";

const toneClass: Record<IconTone, string> = {
  default:
    "text-muted hover:text-fg hover:bg-muted-surface no-hover:active:bg-muted-surface no-hover:active:text-fg",
  primary:
    "text-muted hover:text-blue-700 hover:bg-blue-100 dark:hover:text-blue-400 dark:hover:bg-blue-950/30 no-hover:active:bg-blue-100 no-hover:active:text-blue-700 dark:no-hover:active:bg-blue-950/30 dark:no-hover:active:text-blue-400",
  success:
    "text-green-700 hover:text-green-800 hover:bg-green-100 dark:text-green-400 dark:hover:text-green-300 dark:hover:bg-green-950/30 no-hover:active:bg-green-100 no-hover:active:text-green-800 dark:no-hover:active:bg-green-950/30 dark:no-hover:active:text-green-300",
  danger:
    "text-subtle hover:text-red-700 hover:bg-red-100 dark:hover:text-red-400 dark:hover:bg-red-950/30 no-hover:active:bg-red-100 no-hover:active:text-red-700 dark:no-hover:active:bg-red-950/30 dark:no-hover:active:text-red-400",
  warning:
    "text-amber-700 hover:text-amber-800 hover:bg-amber-100 dark:text-yellow-400 dark:hover:text-yellow-300 dark:hover:bg-yellow-950/30 no-hover:active:bg-amber-100 no-hover:active:text-amber-800 dark:no-hover:active:bg-yellow-950/30 dark:no-hover:active:text-yellow-300",
};

const baseClass =
  `${TOUCH_TARGET_ICON_CLASS} rounded-sm transition-colors duration-150 focus:outline-hidden focus:ring-2 focus:ring-blue-500/60 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent`;

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

interface IconProps {
  icon: LucideIcon;
  label: string;
  title?: string;
  tone?: IconTone;
  className?: string;
  iconClassName?: string;
}

export function IconButton({
  icon: Icon,
  label,
  title,
  tone = "default",
  className,
  iconClassName,
  type = "button",
  ...props
}: IconProps & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type={type}
      aria-label={label}
      title={title ?? label}
      className={cx(baseClass, toneClass[tone], className)}
      {...props}
    >
      <Icon className={cx("h-4 w-4", iconClassName)} aria-hidden="true" />
    </button>
  );
}

export function IconLink({
  href,
  icon: Icon,
  label,
  title,
  tone = "default",
  className,
  iconClassName,
}: IconProps & { href: string }) {
  return (
    <Link
      href={href}
      aria-label={label}
      title={title ?? label}
      className={cx(baseClass, toneClass[tone], className)}
    >
      <Icon className={cx("h-4 w-4", iconClassName)} aria-hidden="true" />
    </Link>
  );
}
