"use client";

import Link from "next/link";
import { SOURCE_LABEL, type Run } from "@/lib/api";
import { useLeadFlow } from "./LeadFlowProvider";
import { runTitle } from "./Research";
import { Card, Icon, Spinner, btn } from "./ui";

const STYLE: Record<string, [string, string]> = {
  queued: ["bg-signal-soft text-signal-strong", "Queued"],
  running: ["bg-signal-soft text-signal-strong", "Running"],
  completed: ["bg-mint-soft text-mint", "Complete"],
  partial: ["bg-amber-soft text-amber", "Partial"],
  failed: ["bg-danger-soft text-danger", "Needs attention"],
};

function duration(run: Run) {
  if (!run.finished_at) return "";
  const s = (new Date(run.finished_at).getTime() - new Date(run.created_at).getTime()) / 1000;
  if (!Number.isFinite(s) || s < 0) return "";
  return s < 60 ? `${Math.round(s)}s` : `${Math.floor(s / 60)}m ${Math.round(s % 60)}s`;
}

export function Runs() {
  const { runs, leads, loading, connected } = useLeadFlow();
  const found = leads.length;
  const problems = runs.filter((r) => r.status === "failed" || r.status === "partial").length;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-[30px] leading-tight font-bold">Research runs</h1>
          <p className="mt-1 text-[15px] text-muted">Latest 20 runs</p>
        </div>
        <Link href="/" className={btn.dark}><Icon name="spark" /> New research</Link>
      </header>

      <div className="grid grid-cols-3 gap-2.5">
        {[["Runs", runs.length], ["Leads saved", found], ["With errors", problems]].map(([label, n]) => (
          <div key={label} className="rounded-2xl bg-card px-4 py-3.5 ring-1 ring-line">
            <p className="text-xs font-bold text-muted">{label}</p>
            <p className="tabular mt-1 font-display text-3xl font-extrabold">{loading ? "–" : n}</p>
          </div>
        ))}
      </div>

      <Card className="overflow-hidden">
        {loading ? (
          <div className="flex items-center gap-2 p-8 text-sm text-muted"><Spinner /> Loading runs…</div>
        ) : !runs.length ? (
          <div className="flex flex-col items-center px-6 py-14 text-center">
            <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-3xl bg-violet-soft text-violet"><Icon name="runs" className="h-6 w-6" /></span>
            <h2 className="font-display text-xl font-bold">{connected === false ? "Runs unavailable offline" : "No research runs yet"}</h2>
            <p className="mt-1.5 max-w-sm text-sm text-muted">Your searches will show up here.</p>
          </div>
        ) : (
          <ol>
            {runs.map((r) => {
              const [cls, label] = STYLE[r.status] ?? ["bg-soft text-muted", r.status];
              const active = r.status === "queued" || r.status === "running";
              const pct = r.total ? Math.round((r.processed / r.total) * 100) : active ? 6 : 100;
              return (
                <li key={r.id} className="border-b border-line px-5 py-4 last:border-0 sm:px-6">
                  <div className="flex flex-wrap items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-bold">{r.target}</p>
                      <p className="mt-0.5 text-xs text-muted">
                        {SOURCE_LABEL[r.source] ?? r.source} · {new Date(r.created_at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
                        {duration(r) && <> · took {duration(r)}</>}
                      </p>
                    </div>
                    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ${cls}`}>
                      {active && <Spinner className="h-3 w-3" />}{label}
                    </span>
                  </div>
                  <div className="mt-3 flex items-center gap-3">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-soft">
                      <div className={`h-full rounded-full ${r.status === "failed" ? "bg-danger" : r.status === "partial" ? "bg-amber" : r.status === "completed" ? "bg-mint" : "bg-signal progress-live"}`}
                        style={{ width: `${pct}%` }} />
                    </div>
                    <span className="tabular text-xs font-semibold text-muted">{r.processed}/{r.total} processed</span>
                  </div>
                  <p className="sr-only">{runTitle(r)}</p>
                  {r.error && <p className="mt-3 rounded-xl bg-danger-soft px-3.5 py-2.5 text-[13px] leading-relaxed text-danger">{r.error}</p>}
                </li>
              );
            })}
          </ol>
        )}
      </Card>
    </div>
  );
}
