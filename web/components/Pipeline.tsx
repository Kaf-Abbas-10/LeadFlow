"use client";

import { useMemo, useRef, useState } from "react";
import { exportCsv, safeWebsite, type Lead, type LeadStatus } from "@/lib/api";
import { useLeadFlow } from "./LeadFlowProvider";
import { LeadDrawer } from "./LeadDrawer";
import { Composer, RunBanner } from "./Research";
import { Avatar, Card, FIT_LABEL, FitMeter, Icon, StatusChip, btn } from "./ui";

type Filter = "all" | LeadStatus;
type Sort = "score-desc" | "score-asc" | "name" | "newest";

const STAGES: { id: Filter; label: string; sub: string }[] = [
  { id: "all", label: "All leads", sub: "" },
  { id: "review", label: "Needs review", sub: "" },
  { id: "approved", label: "Approved", sub: "" },
  { id: "sent", label: "Sent (demo)", sub: "" },
];

const select =
  "rounded-xl bg-card py-2.5 pr-8 pl-3 text-sm font-semibold text-ink ring-1 ring-line outline-none focus:ring-2 focus:ring-violet";

export function Pipeline() {
  const { leads, loading, connected, busy, batch } = useLeadFlow();
  const [composerOpen, setComposerOpen] = useState<boolean | null>(null);
  const [filter, setFilterState] = useState<Filter>("review");
  const [query, setQuery] = useState("");
  const [fit, setFit] = useState("all");
  const [sort, setSort] = useState<Sort>("score-desc");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [openId, setOpenId] = useState<string | null>(null);
  const [focusEvidence, setFocusEvidence] = useState(false);
  const [scoreHelp, setScoreHelp] = useState(false);
  const [mutating, setMutating] = useState(false);
  const queueRef = useRef<HTMLDivElement>(null);

  // the composer starts open only for an empty workspace
  const open = composerOpen ?? (!loading && leads.length === 0);

  const counts = useMemo(() => {
    const c = { all: leads.length, review: 0, approved: 0, sent: 0 };
    for (const l of leads) c[l.status]++;
    return c;
  }, [leads]);

  const visible = useMemo(() => {
    const term = query.trim().toLowerCase();
    return leads
      .filter((l) => (filter === "all" || l.status === filter) && (fit === "all" || l.fit === fit)
        && `${l.name} ${l.location} ${l.site}`.toLowerCase().includes(term))
      .sort((a, b) => (sort === "score-asc" ? a.score - b.score
        : sort === "name" ? a.name.localeCompare(b.name)
        : sort === "newest" ? String(b.created_at).localeCompare(String(a.created_at))
        : b.score - a.score) || a.name.localeCompare(b.name));
  }, [leads, filter, fit, query, sort]);

  // only visible rows count as selected (filters never act on hidden rows)
  const chosen = visible.filter((l) => selected.has(l.id));
  const pending = chosen.filter((l) => l.status === "review");
  const approved = chosen.filter((l) => l.status === "approved");
  const allOn = visible.length > 0 && chosen.length === visible.length;

  const setFilter = (f: Filter) => { setFilterState(f); setSelected(new Set()); };
  const toggle = (id: string) => setSelected((s) => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    return n;
  });

  async function runBatch(status: "approved" | "sent") {
    const ids = (status === "approved" ? pending : approved).map((l) => l.id);
    if (!ids.length) return;
    setMutating(true);
    await batch(ids, status);
    setSelected(new Set());
    setMutating(false);
  }

  const reviewCopy = loading ? "Loading…"
    : counts.review ? `${counts.review} to review`
    : leads.length ? "All caught up"
    : "Find companies to get started";

  const lead = openId ? leads.find((l) => l.id === openId) ?? null : null;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          <h1 className="font-display text-[30px] leading-tight font-bold">Pipeline</h1>
          <p className="mt-1 text-[15px] text-muted">{reviewCopy}</p>
        </div>
        <div className="flex gap-2">
          <button className={btn.ghost} onClick={() => exportCsv(leads)} disabled={!leads.length || loading}
            title="Exports every loaded lead">
            <Icon name="download" /> Export CSV
          </button>
          <button className={btn.dark} onClick={() => setComposerOpen(true)} disabled={!connected}>
            <Icon name="spark" /> Find leads
          </button>
        </div>
      </header>

      <RunBanner />
      <Composer open={open} onToggle={() => setComposerOpen(!open)}
        onStarted={() => { setFilter("review"); setComposerOpen(false); }} />

      {/* pipeline stages double as the status filter */}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4" role="group" aria-label="Filter by pipeline stage">
        {STAGES.map((s) => {
          const on = filter === s.id;
          return (
            <button key={s.id} onClick={() => setFilter(s.id)} aria-pressed={on}
              className={`group relative overflow-hidden rounded-2xl bg-card px-4 py-3.5 text-left transition ${on ? "ring-2 ring-signal shadow-[0_8px_24px_-14px_rgb(234_88_12/0.6)]" : "ring-1 ring-line hover:ring-[#e2d9d0]"}`}>
              <span className={`flex items-center gap-1.5 text-xs font-semibold ${on ? "text-signal-strong" : "text-muted"}`}>
                {s.label}
              </span>
              <span className="mt-1 flex items-baseline gap-2">
                <span className="tabular font-display text-3xl font-bold">{loading ? "–" : counts[s.id]}</span>
              </span>
              {s.id === "review" && counts.review > 0 && !on && <span className="absolute top-3.5 right-3.5 h-2 w-2 rounded-full bg-signal" aria-hidden />}
            </button>
          );
        })}
      </div>

      <Card className="overflow-hidden">
        <div ref={queueRef} className="flex flex-wrap items-center gap-2.5 border-b border-line px-4 py-3.5 sm:px-5">
          <label className="relative min-w-0 flex-1 basis-56">
            <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-faint"><Icon name="search" className="h-4 w-4" /></span>
            <input type="search" value={query} onChange={(e) => { setQuery(e.target.value); setSelected(new Set()); }}
              placeholder="Search companies, places or websites" aria-label="Search companies"
              className="w-full rounded-xl bg-bg py-2.5 pr-3 pl-9 text-sm ring-1 ring-line outline-none placeholder:text-faint focus:bg-card focus:ring-2 focus:ring-violet" />
          </label>
          <select className={select} value={fit} onChange={(e) => { setFit(e.target.value); setSelected(new Set()); }} aria-label="Target fit">
            <option value="all">All fits</option>
            {Object.entries(FIT_LABEL).map(([v, label]) => <option key={v} value={v}>{label}</option>)}
          </select>
          <select className={select} value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sort by">
            <option value="score-desc">Highest score</option>
            <option value="score-asc">Lowest score</option>
            <option value="name">Company name</option>
            <option value="newest">Newest first</option>
          </select>
          <button onClick={() => setScoreHelp(!scoreHelp)} aria-expanded={scoreHelp} aria-controls="scoreHelp"
            className="flex items-center gap-1.5 rounded-xl px-2.5 py-2 text-sm font-semibold text-violet hover:bg-violet-soft">
            <Icon name="info" className="h-4 w-4" /> Score?
          </button>
        </div>
        {scoreHelp && (
          <p id="scoreHelp" className="rise border-b border-line bg-signal-soft/60 px-5 py-3 text-sm text-ink">
            <b>Fit score:</b> the AI&apos;s 0–100 guess at how well a company matches your target. A suggestion only; you decide.
          </p>
        )}

        {/* column header (desktop) */}
        <div className="hidden grid-cols-[20px_minmax(0,2fr)_128px_minmax(0,2.2fr)_128px_92px] items-center gap-5 border-b border-line px-5 py-2.5 text-[11px] font-semibold tracking-wider text-faint uppercase md:grid">
          <input type="checkbox" checked={allOn} disabled={!visible.length}
            ref={(el) => { if (el) el.indeterminate = chosen.length > 0 && !allOn; }}
            onChange={() => setSelected(allOn ? new Set() : new Set(visible.map((l) => l.id)))}
            aria-label="Select all visible leads" className="h-4 w-4 accent-[var(--signal)]" />
          <span>Company</span><span>Fit</span><span>What we found</span><span>Status</span><span className="sr-only">Actions</span>
        </div>

        <ul aria-busy={loading} aria-label="Leads">
          {loading ? (
            [0, 1, 2].map((i) => (
              <li key={i} className="flex items-center gap-4 border-b border-line px-5 py-5 last:border-0" aria-hidden>
                <div className="skeleton h-10 w-10" />
                <div className="flex-1 space-y-2"><div className="skeleton h-3.5 w-1/3" /><div className="skeleton h-3 w-1/2" /></div>
                <div className="skeleton hidden h-10 w-10 rounded-full sm:block" />
              </li>
            ))
          ) : visible.length ? (
            visible.map((l) => (
              <LeadRow key={l.id} lead={l} checked={selected.has(l.id)} onCheck={() => toggle(l.id)}
                onOpen={(evidence) => { setFocusEvidence(evidence); setOpenId(l.id); }} />
            ))
          ) : (
            <Empty filter={filter} hasLeads={leads.length > 0} filtered={!!query || fit !== "all"} connected={connected !== false}
              busy={busy} onStart={() => setComposerOpen(true)} onClear={() => { setQuery(""); setFit("all"); }} />
          )}
        </ul>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-5 py-3 text-xs text-muted" role="status">
          <span className="tabular">{loading ? "Loading saved leads…" : `${visible.length} of ${leads.length}`}</span>
          <span>No emails are ever sent.</span>
        </div>
      </Card>

      {/* floating bulk bar */}
      {chosen.length > 0 && (
        <div className="fixed inset-x-0 bottom-5 z-40 flex justify-center px-4 lg:pl-[260px]">
          <div className="rise flex w-full max-w-2xl flex-wrap items-center gap-2 rounded-2xl bg-card p-2 pl-4 shadow-[0_20px_50px_-20px_rgb(29_25_22/0.45)] ring-1 ring-line" role="region" aria-label="Bulk actions">
            <span className="tabular text-sm font-bold">{chosen.length} selected</span>
            <span className="hidden text-xs text-muted sm:inline">{pending.length} to review · {approved.length} approved</span>
            <button onClick={() => setSelected(new Set())} className="rounded-lg px-2 py-1 text-xs font-semibold text-muted hover:text-ink">Clear</button>
            <span className="ml-auto flex gap-2">
              {pending.length > 0 && (
                <button className={`${btn.primary} !py-2`} disabled={mutating || !connected} onClick={() => runBatch("approved")}>
                  <Icon name="check" className="h-4 w-4" /> Approve {pending.length}
                </button>
              )}
              {approved.length > 0 && (
                <button className="inline-flex items-center gap-2 rounded-xl bg-soft px-4 py-2 text-sm font-bold hover:bg-line disabled:opacity-45"
                  disabled={mutating || !connected} onClick={() => runBatch("sent")}>
                  <Icon name="send" className="h-4 w-4" /> Mark {approved.length} sent · demo
                </button>
              )}
            </span>
          </div>
        </div>
      )}

      <LeadDrawer lead={lead} focusEvidence={focusEvidence} onClose={() => setOpenId(null)} />
    </div>
  );
}

function LeadRow({ lead: l, checked, onCheck, onOpen }: { lead: Lead; checked: boolean; onCheck: () => void; onOpen: (evidence: boolean) => void }) {
  const host = safeWebsite(l.site)?.hostname.replace(/^www\./, "");
  const verb = l.status === "sent" ? "View" : l.status === "approved" ? "Open" : "Review";
  return (
    <li className={`group grid grid-cols-[20px_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2.5 border-b border-line px-4 py-3.5 transition last:border-0 sm:px-5 md:grid-cols-[20px_minmax(0,2fr)_128px_minmax(0,2.2fr)_128px_92px] md:gap-x-5 ${checked ? "bg-signal-soft/60" : "hover:bg-bg"}`}>
      <input type="checkbox" checked={checked} onChange={onCheck} aria-label={`Select ${l.name}`} className="h-4 w-4 accent-[var(--signal)]" />
      <div className="flex min-w-0 items-center gap-3">
        <Avatar name={l.name} size={36} />
        <div className="min-w-0">
          <p className="truncate text-[14.5px] font-bold">{l.name}</p>
          <p className="truncate text-xs text-muted">
            {l.location || <span className="text-faint">Location unverified</span>}
            {host && <><span className="text-faint"> · </span>{host}</>}
          </p>
        </div>
      </div>
      <div className="justify-self-end md:justify-self-start"><FitMeter score={l.score} fit={l.fit} /></div>
      <button onClick={() => onOpen(true)} aria-label={`Read evidence for ${l.name}`} title="Read the research"
        className="col-span-3 min-w-0 pl-[48px] text-left md:col-span-1 md:pl-0">
        <span className="line-clamp-1 text-[13px] leading-relaxed text-muted transition group-hover:text-ink">{l.insight.trim() || "No research evidence saved."}</span>
      </button>
      <div className="col-span-3 flex items-center justify-between gap-2 pl-[48px] md:contents">
        <span><StatusChip status={l.status} /></span>
        <button onClick={() => onOpen(false)} data-draft={l.id} aria-label={`${verb} draft for ${l.name}`}
          className={`inline-flex items-center justify-center gap-1.5 rounded-xl px-3.5 py-2 text-[13px] font-bold transition md:justify-self-end ${l.status === "review" ? "bg-signal-soft text-signal-strong group-hover:bg-signal group-hover:text-white" : "bg-card text-ink ring-1 ring-line hover:ring-signal"}`}>
          {verb} <span aria-hidden>→</span>
        </button>
      </div>
    </li>
  );
}

function Empty({ filter, hasLeads, filtered, connected, busy, onStart, onClear }: {
  filter: Filter; hasLeads: boolean; filtered: boolean; connected: boolean; busy: boolean; onStart: () => void; onClear: () => void;
}) {
  let title = "All caught up";
  let copy = "Nothing left to review.";
  let action: React.ReactNode = null;
  if (!connected) {
    title = "Research service unavailable";
    copy = "Start the backend, then reconnect.";
  } else if (!hasLeads) {
    title = busy ? "Research is in progress" : "Your pipeline is empty";
    copy = busy ? "New drafts appear here." : "Find companies and review AI-drafted intros.";
    if (!busy) action = <button className={btn.primary} onClick={onStart}><Icon name="spark" /> Find your first companies</button>;
  } else if (filtered) {
    title = "No matching companies";
    copy = "Try another search.";
    action = <button className={btn.ghost} onClick={onClear}>Clear filters</button>;
  } else if (filter === "approved") {
    title = "No approved drafts yet";
    copy = "Approve a draft to see it here.";
  } else if (filter === "sent") {
    title = "No demo-sent records";
    copy = "Mark approved drafts sent to see them here.";
  }
  return (
    <li className="flex flex-col items-center px-6 py-14 text-center">
      <span className="relative mb-5 flex h-16 w-16 items-center justify-center rounded-3xl bg-signal-soft text-signal-strong">
        <Icon name={connected ? "pipeline" : "wifi"} className="h-7 w-7" />
      </span>
      <h3 className="font-display text-xl font-bold">{title}</h3>
      <p className="mt-1.5 max-w-sm text-sm text-muted">{copy}</p>
      {action && <div className="mt-5">{action}</div>}
    </li>
  );
}
