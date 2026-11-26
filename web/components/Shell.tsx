"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useLeadFlow } from "./LeadFlowProvider";
import { Icon, Logo, Spinner, Toasts, btn } from "./ui";

const NAV = [
  { href: "/", label: "Pipeline", icon: "pipeline" as const },
  { href: "/runs", label: "Research runs", icon: "runs" as const },
  { href: "/setup", label: "Connections", icon: "plug" as const },
];

function ConnectionDot() {
  const { connected } = useLeadFlow();
  const [tone, label] = connected === null ? ["bg-amber", "Connecting…"] : connected ? ["bg-mint", "API connected"] : ["bg-danger", "API offline"];
  return (
    <span className="flex items-center gap-2 text-xs font-semibold" role="status">
      <span className={`h-2 w-2 rounded-full ${tone}`} />
      {label}
    </span>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const { leads, busy, connected, connect } = useLeadFlow();
  const review = leads.filter((l) => l.status === "review").length;

  return (
    <div className="min-h-dvh lg:flex">
      {/* desktop: full-height white sidebar */}
      <aside className="hidden w-[248px] shrink-0 border-r border-line bg-card lg:block" aria-label="Main navigation">
       <div className="sticky top-0 flex h-dvh flex-col">
        <Link href="/" className="flex items-center gap-2.5 px-6 pt-7 pb-8">
          <Logo size={32} />
          <span className="font-display text-[21px] font-bold tracking-tight">LeadFlow</span>
        </Link>
        <nav className="flex flex-col gap-0.5 px-3">
          {NAV.map((n) => {
            const active = n.href === "/" ? path === "/" : path.startsWith(n.href);
            return (
              <Link key={n.href} href={n.href} aria-current={active ? "page" : undefined}
                className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${active ? "bg-signal-soft text-signal-strong" : "text-muted hover:bg-soft hover:text-ink"}`}>
                <Icon name={n.icon} />
                <span className="flex-1">{n.label}</span>
                {n.href === "/" && review > 0 && (
                  <span className="tabular min-w-5 rounded-full bg-signal px-1.5 py-0.5 text-center text-[11px] font-bold text-white">{review}</span>
                )}
                {n.href === "/runs" && busy && <span className="pulse-dot h-2 w-2 rounded-full bg-signal" aria-label="A run is in progress" />}
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto p-4">
          <div className="flex items-center justify-between px-1 text-muted">
            <ConnectionDot />
            <span className="text-[11px] text-faint">v0.2 · local</span>
          </div>
        </div>
       </div>
      </aside>

      {/* mobile: compact top bar */}
      <header className="sticky top-0 z-30 border-b border-line bg-card/95 backdrop-blur lg:hidden">
        <div className="flex items-center justify-between px-4 py-3">
          <Link href="/" className="flex items-center gap-2.5">
            <Logo size={28} />
            <span className="font-display text-lg font-bold">LeadFlow</span>
          </Link>
          <span className="text-muted"><ConnectionDot /></span>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-3 pb-2.5" aria-label="Main navigation">
          {NAV.map((n) => {
            const active = n.href === "/" ? path === "/" : path.startsWith(n.href);
            return (
              <Link key={n.href} href={n.href} aria-current={active ? "page" : undefined}
                className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold ${active ? "bg-signal text-white" : "bg-soft text-muted"}`}>
                {n.label}
                {n.href === "/" && review > 0 && <span className="tabular">· {review}</span>}
              </Link>
            );
          })}
        </nav>
      </header>

      <main id="main" className="min-w-0 flex-1">
        {connected === false && (
          <div className="border-b border-danger/20 bg-danger-soft px-4 py-3 sm:px-8" role="alert">
            <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 text-sm text-danger">
              <Icon name="wifi" />
              <p className="flex-1 font-semibold">
                Can&apos;t reach the LeadFlow API. Saved leads are safe; start the backend and reconnect.
              </p>
              <button onClick={connect} className={`${btn.ghost} !py-1.5`}>Reconnect</button>
            </div>
          </div>
        )}
        {connected === null && (
          <div className="flex items-center gap-2 px-4 pt-4 text-xs font-semibold text-muted sm:px-8"><Spinner className="h-3 w-3" /> Connecting to the API…</div>
        )}
        <div className="mx-auto max-w-6xl px-4 py-6 sm:px-8 sm:py-9">{children}</div>
      </main>
      <Toasts />
    </div>
  );
}
