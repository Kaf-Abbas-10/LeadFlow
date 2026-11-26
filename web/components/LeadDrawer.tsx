"use client";

import { useEffect, useRef, useState } from "react";
import { safeWebsite, timeAgo, type Lead, type LeadStatus } from "@/lib/api";
import { useLeadFlow } from "./LeadFlowProvider";
import { Avatar, FitChip, Icon, ScoreRing, Spinner, StatusChip, btn } from "./ui";

/** Slide-over for one lead: research evidence + the editable draft + the decision. */
export function LeadDrawer({ lead, focusEvidence, onClose }: { lead: Lead | null; focusEvidence: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const returnTo = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (lead && !d.open) {
      returnTo.current = document.activeElement as HTMLElement | null;
      d.showModal();
    } else if (!lead && d.open) {
      d.close();
      returnTo.current?.focus({ preventScroll: true });
    }
  }, [lead]);

  return (
    <dialog ref={ref} className="drawer" aria-labelledby="drawerTitle"
      onCancel={(e) => { e.preventDefault(); onClose(); }}
      onClick={(e) => { if (e.target === ref.current) onClose(); }}>
      {lead && <Panel key={lead.id} lead={lead} focusEvidence={focusEvidence} onClose={onClose} />}
    </dialog>
  );
}

function Panel({ lead, focusEvidence, onClose }: { lead: Lead; focusEvidence: boolean; onClose: () => void }) {
  const { update, toast, connected } = useLeadFlow();
  const [draft, setDraft] = useState(lead.draft);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const evidenceRef = useRef<HTMLHeadingElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  const url = safeWebsite(lead.site);
  const sent = lead.status === "sent";
  const edited = draft !== lead.draft;
  const offline = connected === false;

  useEffect(() => {
    if (focusEvidence) evidenceRef.current?.focus();
    else if (sent) closeRef.current?.focus();
    else textRef.current?.focus();
  }, [focusEvidence, sent]);

  async function act(label: string, body: { draft?: string; status?: LeadStatus }, done: string) {
    setBusy(label);
    setError("");
    try {
      await update(lead.id, body);
      toast(done);
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const status = sent ? "Sent (demo) · read-only."
    : lead.status === "approved"
      ? edited ? "Saving sends this draft back to review." : "Approved. Mark sent, or move back to review."
      : "Edit if needed, then approve.";

  return (
    <div className="drawer-panel flex h-full flex-col bg-card shadow-2xl sm:rounded-l-[28px]">
      <header className="relative overflow-hidden border-b border-line bg-gradient-to-b from-signal-soft to-card px-5 pt-5 pb-5 sm:px-7">
                <div className="relative flex items-start justify-between gap-3">
          <p className="text-[11px] font-bold tracking-[0.14em] text-signal-strong uppercase">Evidence &amp; draft</p>
          <button ref={closeRef} onClick={onClose} aria-label="Close lead review"
            className="-mt-1 -mr-2 flex h-9 w-9 items-center justify-center rounded-full text-muted hover:bg-soft hover:text-ink">
            <Icon name="close" />
          </button>
        </div>
        <div className="relative mt-2 flex items-center gap-3.5">
          <Avatar name={lead.name} size={48} />
          <div className="min-w-0">
            <h2 id="drawerTitle" className="truncate font-display text-2xl font-bold">{lead.name}</h2>
            <p className="truncate text-sm text-muted">
              {lead.location || "Location not verified"} · found {timeAgo(lead.created_at)}
            </p>
          </div>
        </div>
        <div className="relative mt-4 flex flex-wrap items-center gap-2">
          <StatusChip status={lead.status} />
          <FitChip fit={lead.fit} />
          {url && (
            <a href={url.href} target="_blank" rel="noopener noreferrer" aria-label={`Visit ${url.hostname} (opens in a new tab)`}
              className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-card px-3 py-1 text-xs font-bold text-ink ring-1 ring-line hover:ring-signal">
              {url.hostname.replace(/^www\./, "")} <Icon name="external" className="h-3.5 w-3.5" />
            </a>
          )}
        </div>
      </header>

      <div className="flex-1 space-y-6 overflow-y-auto px-5 py-6 sm:px-7">
        <section aria-labelledby="evidenceTitle">
          <h3 id="evidenceTitle" ref={evidenceRef} tabIndex={-1} className="text-xs font-bold tracking-wider text-faint uppercase outline-none">
            Research evidence
          </h3>
          <div className="mt-2.5 flex gap-4 rounded-2xl bg-bg p-4 ring-1 ring-line">
            <ScoreRing score={lead.score} fit={lead.fit} size={58} stroke={5.5} />
            <div className="min-w-0">
              <p className="text-[15px] leading-relaxed">{lead.insight.trim() || "No research saved."}</p>
              <p className="mt-2 text-xs text-muted">
                AI summary. Check the website before approving.
              </p>
            </div>
          </div>
        </section>

        <section aria-labelledby="draftTitle">
          <div className="flex items-baseline justify-between">
            <h3 id="draftTitle" className="text-xs font-bold tracking-wider text-faint uppercase">Personalised draft</h3>
            <span className={`tabular text-xs ${draft.length > 3800 ? "text-danger" : "text-faint"}`}>{draft.length}/4000</span>
          </div>
          <div className={`mt-2.5 overflow-hidden rounded-2xl ring-1 transition ${sent ? "bg-bg ring-line" : "bg-card ring-line focus-within:ring-2 focus-within:ring-violet"}`}>
            <div className="flex items-center gap-2 border-b border-line px-4 py-2.5 text-xs text-muted">
              <span className="font-bold text-ink">To</span> {lead.name}
              <span className="ml-auto rounded-full bg-soft px-2 py-0.5 text-[10px] font-bold tracking-wide text-muted uppercase">Draft · not sent</span>
            </div>
            <label htmlFor="draftText" className="sr-only">Edit personalised draft</label>
            <textarea id="draftText" ref={textRef} value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={4000} rows={11}
              disabled={sent || offline} aria-describedby="draftStatus"
              className="block w-full resize-y bg-transparent px-4 py-3.5 text-[15px] leading-relaxed outline-none disabled:text-muted" />
          </div>
          <p id="draftStatus" className="mt-2 text-xs text-muted">{status}</p>
          {error && <p className="mt-3 rounded-xl bg-danger-soft px-3.5 py-2.5 text-sm font-semibold text-danger" role="alert">{error}</p>}
        </section>
      </div>

      <footer className="border-t border-line bg-card px-5 py-4 sm:px-7">
        <p className="mb-3 flex items-center gap-1.5 text-xs text-muted">
          <Icon name="info" className="h-3.5 w-3.5" /> No email is sent.
        </p>
        <div className="flex flex-wrap justify-end gap-2">
          {sent ? (
            <button className={btn.ghost} onClick={onClose}>Close</button>
          ) : lead.status === "review" ? (
            <>
              <button className={btn.ghost} disabled={!!busy || offline || !edited}
                onClick={() => act("save", { draft }, "Changes saved.")}>
                {busy === "save" && <Spinner />} Save changes
              </button>
              <button className={btn.primary} disabled={!!busy || offline || !draft.trim()}
                onClick={() => act("approve", { draft, status: "approved" }, "Draft approved. No email sent.")}>
                {busy === "approve" ? <Spinner /> : <Icon name="check" className="h-4 w-4" />} Approve draft
              </button>
            </>
          ) : edited ? (
            <>
              <button className={btn.ghost} disabled={!!busy} onClick={() => setDraft(lead.draft)}>Discard edits</button>
              <button className={btn.dark} disabled={!!busy || offline || !draft.trim()}
                onClick={() => act("save", { draft }, "Saved. Back in review.")}>
                {busy === "save" && <Spinner />} Save &amp; return to review
              </button>
            </>
          ) : (
            <>
              <button className={btn.ghost} disabled={!!busy || offline}
                onClick={() => act("back", { status: "review" }, "Moved back to review.")}>
                {busy === "back" ? <Spinner /> : <Icon name="undo" className="h-4 w-4" />} Back to review
              </button>
              <button className={btn.primary} disabled={!!busy || offline}
                onClick={() => act("send", { status: "sent" }, "Marked sent (demo).")}>
                {busy === "send" ? <Spinner /> : <Icon name="send" className="h-4 w-4" />} Mark sent · demo
              </button>
            </>
          )}
        </div>
      </footer>
    </div>
  );
}
