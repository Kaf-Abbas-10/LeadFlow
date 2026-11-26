"use client";

import type { ReactNode } from "react";
import { STATUS_LABEL, type LeadStatus } from "@/lib/api";
import { useLeadFlow } from "./LeadFlowProvider";

export const btn = {
  primary:
    "inline-flex items-center justify-center gap-2 rounded-xl bg-signal px-4 py-2.5 text-sm font-bold text-white shadow-[0_6px_16px_-8px_rgb(234_88_12/0.7)] transition hover:bg-signal-strong disabled:cursor-not-allowed disabled:opacity-45 disabled:shadow-none",
  dark:
    "inline-flex items-center justify-center gap-2 rounded-xl bg-signal px-4 py-2.5 text-sm font-bold text-white transition hover:bg-signal-strong disabled:cursor-not-allowed disabled:opacity-45",
  ghost:
    "inline-flex items-center justify-center gap-2 rounded-xl bg-card px-4 py-2.5 text-sm font-semibold text-ink ring-1 ring-line transition hover:bg-soft disabled:cursor-not-allowed disabled:opacity-45",
  text: "font-semibold text-violet underline-offset-4 hover:underline disabled:opacity-45",
};

export function Logo({ size = 34 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden>
      <rect width="40" height="40" rx="12" fill="#f97316" />
      <path d="M9 27c6 0 7-14 13-14 4 0 4 6 9 6" fill="none" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" />
      <circle cx="31" cy="19" r="3.4" fill="#fff" />
    </svg>
  );
}

/** Calm monogram: warm neutral tile, ink initials. */
export function Avatar({ name, size = 40 }: { name: string; size?: number }) {
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?";
  return (
    <span aria-hidden style={{ width: size, height: size, fontSize: size * 0.34 }}
      className="flex shrink-0 items-center justify-center rounded-xl bg-soft font-display font-bold text-ink/80 ring-1 ring-line">
      {initials}
    </span>
  );
}

/** Display names for the AI's fit recommendation (stored values stay "Good fit" / "Maybe" / "Skip"). */
export const FIT_LABEL: Record<string, string> = { "Good fit": "Strong fit", Maybe: "Possible fit", Skip: "Weak fit" };

export function fitTone(fit: string) {
  return fit === "Good fit"
    ? { color: "var(--signal)", chip: "bg-signal-soft text-signal-strong", text: "text-signal-strong" }
    : fit === "Skip"
      ? { color: "#d6cec6", chip: "bg-soft text-muted", text: "text-faint" }
      : { color: "#fdba74", chip: "bg-amber-soft text-amber", text: "text-amber" };
}

/** Circular fit score (0–100). */
export function ScoreRing({ score, fit, size = 44, stroke = 4.5 }: { score: number; fit: string; size?: number; stroke?: number }) {
  const value = Math.max(0, Math.min(100, Number(score) || 0));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const { color } = fitTone(fit);
  return (
    <span className="relative inline-flex shrink-0 items-center justify-center" style={{ width: size, height: size }}
      role="img" aria-label={`Fit score ${value} out of 100`}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--soft)" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={`${(value / 100) * c} ${c}`} />
      </svg>
      <span className="tabular absolute font-display font-bold text-ink" style={{ fontSize: size * 0.3 }}>{value}</span>
    </span>
  );
}

export function FitChip({ fit }: { fit: string }) {
  return <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-bold ${fitTone(fit).chip}`}>{FIT_LABEL[fit] ?? fit}</span>;
}

/** Score + 5-segment meter + label: readable at a glance, one colour family. */
export function FitMeter({ score, fit }: { score: number; fit: string }) {
  const value = Math.max(0, Math.min(100, Number(score) || 0));
  const lit = Math.round(value / 20);
  const tone = fitTone(fit);
  return (
    <span className="inline-flex flex-col gap-1" role="img" aria-label={`${FIT_LABEL[fit] ?? fit}, score ${value} of 100`}>
      <span className="flex items-center gap-2">
        <span className="tabular w-6 font-display text-[15px] font-bold text-ink">{value}</span>
        <span className="flex gap-[3px]" aria-hidden>
          {[0, 1, 2, 3, 4].map((i) => (
            <span key={i} className="h-[6px] w-[10px] rounded-full" style={{ background: i < lit ? tone.color : "var(--soft)" }} />
          ))}
        </span>
      </span>
      <span className={`text-[11px] font-semibold ${tone.text}`}>{FIT_LABEL[fit] ?? fit}</span>
    </span>
  );
}

const STATUS_STYLE: Record<LeadStatus, { cls: string; icon: keyof typeof ICONS | null }> = {
  review: { cls: "bg-signal-soft text-signal-strong", icon: null },
  approved: { cls: "bg-mint-soft text-mint", icon: "check" },
  sent: { cls: "bg-soft text-muted", icon: "send" },
};
export function StatusChip({ status }: { status: LeadStatus }) {
  const st = STATUS_STYLE[status];
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${st.cls}`}>
      {st.icon ? <Icon name={st.icon} className="h-3 w-3" /> : <span className="h-1.5 w-1.5 rounded-full bg-current" />}
      {STATUS_LABEL[status]}
    </span>
  );
}

export function Spinner({ className = "h-4 w-4" }: { className?: string }) {
  return <span aria-hidden className={`inline-block animate-spin rounded-full border-2 border-current border-r-transparent ${className}`} />;
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-3xl bg-card ring-1 ring-line ${className}`}>{children}</section>;
}

export function Toasts() {
  const { toasts } = useLeadFlow();
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-5 z-50 flex flex-col items-center gap-2 px-4" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`rise pointer-events-auto flex max-w-md items-center gap-2.5 rounded-2xl px-4 py-3 text-sm font-semibold shadow-2xl ${t.tone === "error" ? "bg-danger text-white" : "bg-ink text-white"}`}>
          <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] ${t.tone === "error" ? "bg-white/20" : "bg-signal text-white"}`}>
            {t.tone === "error" ? "!" : "✓"}
          </span>
          {t.text}
        </div>
      ))}
    </div>
  );
}

export function Icon({ name, className = "h-[18px] w-[18px]" }: { name: keyof typeof ICONS; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {ICONS[name]}
    </svg>
  );
}

const ICONS = {
  pipeline: <><path d="M3 6h12M3 12h18M3 18h8" /><circle cx="18" cy="6" r="2" /><circle cx="14" cy="18" r="2" /></>,
  runs: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  plug: <><path d="M9 3v5M15 3v5M7 8h10v3a5 5 0 0 1-10 0zM12 16v5" /></>,
  search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>,
  download: <><path d="M12 4v11m-5-5 5 5 5-5M5 20h14" /></>,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  external: <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />,
  spark: <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6" />,
  upload: <><path d="M12 16V4m-5 5 5-5 5 5M5 20h14" /></>,
  check: <path d="m5 12 4.5 4.5L19 7" />,
  send: <path d="M4 12 20 4l-6 16-3-7z" />,
  undo: <path d="M9 14 4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3" />,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7.5v.01" /></>,
  wifi: <><path d="M2 8.5a15 15 0 0 1 20 0M5 12a10 10 0 0 1 14 0M8.5 15.5a5 5 0 0 1 7 0" /><path d="M12 19h.01" /><path d="M3 3l18 18" /></>,
  chevron: <path d="m6 9 6 6 6-6" />,
  key: <><circle cx="8" cy="15" r="4" /><path d="m11 12 9-9M17 6l3 3M14 9l2 2" /></>,
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  globe: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" /></>,
  file: <><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" /></>,
};
