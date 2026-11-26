"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { api, type Health, type Lead, type LeadStatus, type Run, type Schedule } from "@/lib/api";

type Toast = { id: number; text: string; tone: "ok" | "error" };

interface LeadFlow {
  connected: boolean | null;        // null = still connecting
  loading: boolean;
  health: Health | null;
  schedule: Schedule | null;
  leads: Lead[];
  runs: Run[];
  activeRun: Run | null;            // the latest run (shown in the live banner until dismissed)
  busy: boolean;                    // a run is queued or running
  connect: () => Promise<void>;
  refresh: () => Promise<void>;
  watch: (runId: string) => void;
  dismissRun: () => void;
  update: (id: string, body: { draft?: string; status?: LeadStatus }) => Promise<Lead>;
  batch: (ids: string[], status: "approved" | "sent") => Promise<void>;
  toast: (text: string, tone?: Toast["tone"]) => void;
  toasts: Toast[];
}

const Ctx = createContext<LeadFlow | null>(null);

export function useLeadFlow() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useLeadFlow must be used inside <LeadFlowProvider>");
  return ctx;
}

const FINISHED = ["completed", "failed", "partial"];

export function LeadFlowProvider({ children }: { children: ReactNode }) {
  const [connected, setConnected] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [health, setHealth] = useState<Health | null>(null);
  const [schedule, setSchedule] = useState<Schedule | null>(null);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [activeRun, setActiveRun] = useState<Run | null>(null);
  const [busy, setBusy] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const poll = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toastId = useRef(0);

  const toast = useCallback((text: string, tone: Toast["tone"] = "ok") => {
    const id = ++toastId.current;
    setToasts((t) => [...t.slice(-2), { id, text, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 5000);
  }, []);

  const refresh = useCallback(async () => {
    setLeads(await api.leads());
  }, []);

  const offline = useCallback(() => {
    if (poll.current) clearTimeout(poll.current);
    setConnected(false);
    setLoading(false);
    setBusy(false);
  }, []);

  const watch = useCallback((runId: string) => {
    if (poll.current) clearTimeout(poll.current);
    setBusy(true);
    const tick = async () => {
      try {
        const run = await api.run(runId);
        setActiveRun(run);
        await refresh();
        if (FINISHED.includes(run.status)) {
          setBusy(false);
          setRuns(await api.runs());
          if (run.status === "completed" && run.total) toast("Research complete.");
          return;
        }
        poll.current = setTimeout(tick, 1500);
      } catch {
        offline();
      }
    };
    tick();
  }, [refresh, toast, offline]);

  const connect = useCallback(async () => {
    setConnected(null);
    try {
      const [h, s] = await Promise.all([api.health(), api.schedule()]);
      setHealth(h);
      setSchedule(s);
      const [l, r] = await Promise.all([api.leads(), api.runs()]);
      setLeads(l);
      setRuns(r);
      setConnected(true);
      setLoading(false);
      const running = r.find((x) => x.status === "queued" || x.status === "running");
      if (running) watch(running.id);
      else if (r[0] && r[0].status !== "completed") setActiveRun(r[0]);   // show the last problem run
    } catch {
      offline();
    }
  }, [watch, offline]);

  useEffect(() => {
    // first load: talk to the API once the page is in the browser
    // eslint-disable-next-line react-hooks/set-state-in-effect
    connect();
    return () => {
      if (poll.current) clearTimeout(poll.current);
    };
  }, [connect]);

  const update = useCallback(async (id: string, body: { draft?: string; status?: LeadStatus }) => {
    const lead = await api.updateLead(id, body);
    setLeads((all) => all.map((l) => (l.id === id ? lead : l)));
    return lead;
  }, []);

  const batch = useCallback(async (ids: string[], status: "approved" | "sent") => {
    let done = 0;
    try {
      for (const id of ids) {
        await api.updateLead(id, { status });
        done++;
      }
      toast(status === "approved"
        ? `${done} draft${done === 1 ? "" : "s"} approved. No email sent.`
        : `${done} marked sent for the demo. No email delivered.`);
    } catch (e) {
      toast(`${done} updated, then: ${(e as Error).message}`, "error");
    } finally {
      try {
        await refresh();
      } catch {
        offline();
      }
    }
  }, [refresh, toast, offline]);

  const dismissRun = useCallback(() => setActiveRun(null), []);

  return (
    <Ctx.Provider value={{
      connected, loading, health, schedule, leads, runs, activeRun, busy,
      connect, refresh, watch, dismissRun, update, batch, toast, toasts,
    }}>
      {children}
    </Ctx.Provider>
  );
}
