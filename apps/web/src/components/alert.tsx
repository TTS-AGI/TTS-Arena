import {
  CheckCircle2,
  AlertTriangle,
  Info,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";

/**
 * One inline alert/notice for the whole app. Flat neutral card with a leading
 * status icon — the icon carries the meaning, not a colored side stripe. Use
 * for persistent inline notices (quarantine banner, empty/error states, etc.);
 * for transient feedback use the toast.
 */

type AlertTone = "info" | "success" | "warning" | "error";

const ICON: Record<AlertTone, LucideIcon> = {
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  error: XCircle,
};
const ICON_COLOR: Record<AlertTone, string> = {
  info: "text-ink-3",
  success: "text-emerald-500",
  warning: "text-amber-500",
  error: "text-accent",
};

export function Alert({
  tone = "info",
  title,
  children,
  className = "",
}: {
  tone?: AlertTone;
  title?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  const Icon = ICON[tone];
  return (
    <div className={`card flex items-start gap-2.5 px-4 py-3 ${className}`}>
      <Icon
        className={`mt-0.5 h-4 w-4 shrink-0 ${ICON_COLOR[tone]}`}
        aria-hidden
      />
      <div className="min-w-0 flex-1 text-sm leading-relaxed">
        {title && <span className="font-semibold">{title}</span>}
        {title && children ? " " : null}
        {children && <span className="text-ink-2">{children}</span>}
      </div>
    </div>
  );
}
