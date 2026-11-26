"use client";

import Link from "next/link";
import { useRef, useState, type FormEvent } from "react";
import { api, missingKeys, type Run, type Source } from "@/lib/api";
import { useLeadFlow } from "./LeadFlowProvider";
import { Card, Icon, Spinner, btn } from "./ui";

const SOURCES: { id: Source; title: string; sub: string; icon: "globe" | "search" | "file" }[] = [
  { id: "firecrawl", title: "Web search", sub: "Firecrawl", icon: "globe" },
  { id: "apollo", title: "Company search", sub: "Apollo", icon: "search" },
  { id: "csv", title: "Import CSV", sub: "Your list", icon: "file" },
];
const LIMITS = [3, 6, 10, 25];

const HINT: Record<Source, string> = {
  firecrawl: "Uses provider credits.",
  apollo: "Needs Apollo Company Search access.",
  csv: "Columns: company, location, website. Max 25.",
};

const input =
  "w-full rounded-xl bg-bg px-3.5 py-3 text-sm text-ink ring-1 ring-line outline-none transition placeholder:text-faint focus:bg-card focus:ring-2 focus:ring-violet disabled:opacity-60";

export function Composer({ open, onToggle, onStarted }: { open: boolean; onToggle: () => void; onStarted: () => void }) {
  const { health, connected, busy, loading, watch, schedule } = useLeadFlow();
  const [target, setTarget] = useState("Dental clinics in Texas");
  const [offer, setOffer] = useState("");
  const [chosen, setSource] = useState<Source | null>(null);
  const [limit, setLimit] = useState(6);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [starting, setStarting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const targetRef = useRef<HTMLInputElement>(null);

  // default to the backend's configured source until the user picks one
  const configured = schedule?.source ?? health?.integrations.lead_source;
  const source: Source = chosen ?? (configured === "apollo" || configured === "csv" ? configured : "firecrawl");
  const missing = missingKeys(source, health);
  const locked = busy || starting || !connected;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (target.trim().length < 3) {
      setError("Describe your target in at least three characters.");
      targetRef.current?.focus();
      return;
    }
    if (source === "csv" && !file) {
      setError("Choose a CSV file before starting research.");
      fileRef.current?.focus();
      return;
    }
    setStarting(true);
    try {
      const res = source === "csv"
        ? await api.startCsv(target.trim(), offer.trim(), file!)
        : await api.startOnline({ target: target.trim(), offer: offer.trim(), source, limit });
      watch(res.id);
      onStarted();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setStarting(false);
    }
  }

  if (!open) return null;
  return (
    <Card className="rise overflow-hidden">
      <div className="flex items-center justify-between px-5 pt-4 sm:px-6">
        <h2 className="font-display text-lg font-bold">Find companies</h2>
        <button type="button" onClick={onToggle} aria-label="Close" className="rounded-full p-1.5 text-muted hover:bg-soft hover:text-ink"><Icon name="close" /></button>
      </div>

      {open && (
        <form id="composer" onSubmit={submit} className="px-5 pt-3 pb-5 sm:px-6" noValidate>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 block text-sm font-bold">Who are you looking for?</span>
              <input ref={targetRef} className={input} value={target} onChange={(e) => setTarget(e.target.value)} maxLength={180} required
                disabled={locked} placeholder="e.g. Dental clinics in Austin, Texas" />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-bold">What do you offer? <span className="font-medium text-faint">(optional)</span></span>
              <input className={input} value={offer} onChange={(e) => setOffer(e.target.value)} maxLength={1000} disabled={locked}
                placeholder="e.g. Appointment follow-up software" />
            </label>
          </div>

          <fieldset className="mt-5" disabled={locked}>
            <legend className="mb-2 text-sm font-bold">Lead source</legend>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {SOURCES.map((s) => {
                const on = s.id === source;
                return (
                  <label key={s.id} className={`flex cursor-pointer items-center gap-3 rounded-2xl px-4 py-3 ring-1 transition ${on ? "bg-violet-soft ring-2 ring-violet" : "bg-card ring-line hover:bg-soft"}`}>
                    <input type="radio" name="source" value={s.id} checked={on} onChange={() => { setSource(s.id); setError(""); }} className="sr-only" />
                    <span className={on ? "text-violet" : "text-muted"}><Icon name={s.icon} /></span>
                    <span>
                      <span className="block text-sm font-bold">{s.title}</span>
                      <span className="block text-xs text-muted">{s.sub}</span>
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>

          <div className="mt-5 flex flex-wrap items-end gap-4">
            {source === "csv" ? (
              <div className="min-w-0 flex-1">
                <span className="mb-1.5 block text-sm font-bold" id="csvLabel">CSV file</span>
                <label className={`flex cursor-pointer items-center gap-3 rounded-2xl border-2 border-dashed px-4 py-3 transition ${file ? "border-violet bg-violet-soft" : "border-line hover:border-faint"}`}>
                  <span className="text-violet"><Icon name="upload" /></span>
                  <span className="min-w-0 flex-1 truncate text-sm">
                    {file ? <><b>{file.name}</b> <span className="text-muted">· {(file.size / 1024).toFixed(1)} KB</span></> : <span className="text-muted">Choose a .csv file…</span>}
                  </span>
                  <input ref={fileRef} type="file" accept=".csv,text/csv" aria-labelledby="csvLabel" disabled={locked} className="sr-only"
                    onChange={(e) => { setFile(e.target.files?.[0] ?? null); setError(""); }} />
                </label>
              </div>
            ) : (
              <div>
                <span className="mb-1.5 block text-sm font-bold" id="limitLabel">How many companies?</span>
                <div className="inline-flex rounded-xl bg-bg p-1 ring-1 ring-line" role="radiogroup" aria-labelledby="limitLabel">
                  {LIMITS.map((n) => (
                    <button key={n} type="button" role="radio" aria-checked={limit === n} disabled={locked} onClick={() => setLimit(n)}
                      className={`tabular min-w-11 rounded-lg px-3 py-1.5 text-sm font-bold transition ${limit === n ? "bg-card text-ink shadow-sm ring-1 ring-line" : "text-muted hover:text-ink"}`}>
                      {n}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <button type="submit" className={`${btn.primary} ml-auto !px-6 !py-3`} disabled={locked || loading || missing.length > 0}>
              {busy || starting ? <><Spinner /> Researching…</> : <>Find leads <span aria-hidden>→</span></>}
            </button>
          </div>

          <p className="mt-3 text-xs text-muted">{HINT[source]}</p>

          {connected && missing.length > 0 && (
            <p className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-line pt-4 text-sm text-muted" role="note">
              <span className="text-faint"><Icon name="key" className="h-4 w-4" /></span>
              <span>Not connected. Add {missing.map((k, i) => <span key={k}>{i > 0 && " + "}<code className="rounded bg-soft px-1 py-0.5 text-[12px] text-ink">{k}</code></span>)}</span>
              <Link href="/setup" className="font-semibold text-signal-strong hover:underline">Set up →</Link>
            </p>
          )}
          {error && <p className="mt-3 text-sm text-danger" role="alert">{error}</p>}
        </form>
      )}
    </Card>
  );
}

export function runTitle(run: Run) {
  const active = run.status === "queued" || run.status === "running";
  return run.status === "queued" ? "Research queued"
    : active ? (run.total ? "Researching companies" : "Finding company websites")
    : run.status === "partial" ? "Finished with some errors"
    : run.status === "failed" ? "Research couldn't finish"
    : run.total ? "Research complete" : "No companies found";
}

export function RunBanner() {
  const { activeRun: run, dismissRun } = useLeadFlow();
  const [details, setDetails] = useState(false);
  if (!run) return null;
  const active = run.status === "queued" || run.status === "running";
  const pct = run.total ? Math.round((run.processed / run.total) * 100) : 8;
  const iconTone = active ? "bg-signal-soft text-signal-strong" : run.status === "completed" ? "bg-mint-soft text-mint" : run.status === "failed" ? "bg-danger-soft text-danger" : "bg-amber-soft text-amber";
  const empty = run.status === "completed" && !run.total;
  return (
    <section className="rise overflow-hidden rounded-2xl bg-card ring-1 ring-line" aria-label="Latest research run" aria-live="polite">
      <div className="flex items-center gap-3 px-4 py-2.5">
        <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${iconTone}`}>
          {active ? <Spinner className="h-3.5 w-3.5" /> : <Icon name={run.status === "completed" ? "check" : "info"} className="h-4 w-4" />}
        </span>
        <p className="min-w-0 flex-1 truncate text-sm">
          <b className="font-semibold">{runTitle(run)}</b>
          <span className="text-muted"> · {run.target}{run.total > 0 && <span className="tabular"> · {run.processed}/{run.total}</span>}</span>
        </p>
        {!!run.error && (
          <button onClick={() => setDetails(!details)} aria-expanded={details} className="shrink-0 rounded-lg px-2 py-1 text-xs font-semibold text-muted hover:bg-soft hover:text-ink">
            {details ? "Hide" : "Details"}
          </button>
        )}
        {!active && (
          <button onClick={dismissRun} className="shrink-0 rounded-lg px-2 py-1 text-xs font-semibold text-muted hover:bg-soft hover:text-ink">Dismiss</button>
        )}
      </div>
      {active && (
        <div className="h-1 bg-soft"><div className="progress-live h-full bg-signal transition-all duration-500" style={{ width: `${pct}%` }} /></div>
      )}
      {!!run.error && details && (
        <p className="border-t border-line px-4 py-2.5 text-xs text-muted" role="alert">
          {run.error}
          {/GEMINI_API_KEY|not configured/i.test(run.error) && <> <Link href="/setup" className="font-bold text-ink underline">Connect a provider</Link></>}
        </p>
      )}
      {empty && <p className="border-t border-line px-4 py-2.5 text-xs text-muted">No companies found. Try a broader target.</p>}
    </section>
  );
}
