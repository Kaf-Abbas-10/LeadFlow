// Typed client for the LeadFlow FastAPI backend. Every call goes to /api/*, which proxy.ts
// forwards to the Python server, so the browser never sees provider keys.

export type LeadStatus = "review" | "approved" | "sent";
export type Fit = "Good fit" | "Maybe" | "Skip";
export type Source = "firecrawl" | "apollo" | "csv";
export type RunStatus = "queued" | "running" | "completed" | "partial" | "failed";

export interface Lead {
  id: string;
  run_id: string;
  target: string;
  name: string;
  location: string;
  site: string;
  fit: Fit | string;
  score: number;
  insight: string;
  draft: string;
  status: LeadStatus;
  created_at: string;
}

export interface Run {
  id: string;
  target: string;
  source: Source | string;
  status: RunStatus;
  total: number;
  processed: number;
  error: string;
  created_at: string;
  finished_at: string;
}

export interface Health {
  status: string;
  integrations: {
    lead_source: string;
    apollo: boolean;
    gemini: boolean;
    openai: boolean;
    firecrawl: boolean;
    scheduler_enabled: boolean;
  };
}

export interface Schedule {
  enabled: boolean;
  target: string;
  hour: number;
  timezone: string;
  source: string;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(path, { cache: "no-store", ...options });
  let data: unknown;
  try {
    data = await response.json();
  } catch {
    throw new Error(response.ok ? "The server returned an invalid response." : `The LeadFlow API isn't reachable (${response.status}).`);
  }
  if (!response.ok) {
    const detail = (data as { detail?: unknown })?.detail;
    throw new Error(
      typeof detail === "string" ? detail
        : Array.isArray(detail) ? detail.map((d: { msg?: string }) => d.msg).join("; ")
        : `Request failed (${response.status}).`,
    );
  }
  return data as T;
}

const json = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

export const api = {
  health: () => request<Health>("/api/health"),
  schedule: () => request<Schedule>("/api/schedule"),
  leads: () => request<Lead[]>("/api/leads?limit=1000"),
  runs: () => request<Run[]>("/api/runs"),
  run: (id: string) => request<Run>(`/api/runs/${encodeURIComponent(id)}`),
  startOnline: (body: { target: string; offer: string; source: "firecrawl" | "apollo"; limit: number }) =>
    request<{ id: string; status: string }>("/api/runs", json(body)),
  startCsv: (target: string, offer: string, file: File) => {
    const data = new FormData();
    data.append("file", file);
    return request<{ id: string; status: string; count: number }>(
      `/api/runs/csv?${new URLSearchParams({ target, offer })}`, { method: "POST", body: data });
  },
  updateLead: (id: string, body: { draft?: string; status?: LeadStatus }) =>
    request<Lead>(`/api/leads/${encodeURIComponent(id)}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    }),
};

export function safeWebsite(value: string): URL | null {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) ? url : null;
  } catch {
    return null;
  }
}

export const STATUS_LABEL: Record<LeadStatus, string> = {
  review: "Needs review",
  approved: "Approved",
  sent: "Demo sent",
};

export const SOURCE_LABEL: Record<string, string> = {
  firecrawl: "Web search · Firecrawl",
  apollo: "Company search · Apollo",
  csv: "CSV import",
};

/** What a source needs before research can run (the backend rejects the run otherwise). */
export function missingKeys(source: Source, h: Health | null): string[] {
  if (!h) return [];
  const missing: string[] = [];
  if (source === "firecrawl" && !h.integrations.firecrawl) missing.push("FIRECRAWL_API_KEY");
  if (source === "apollo" && !h.integrations.apollo) missing.push("APOLLO_API_KEY");
  if (!h.integrations.gemini) missing.push("GEMINI_API_KEY");
  return missing;
}

/** Spreadsheet-safe CSV export of every loaded lead (blocks formula injection). */
export function exportCsv(leads: Lead[]) {
  const cell = (value: unknown) => {
    const text = String(value ?? "");
    const safe = /^[=+@\-\t\r]/.test(text) ? `'${text}` : text;
    return `"${safe.replace(/"/g, '""')}"`;
  };
  const rows = [
    ["Company", "Location", "Website", "Fit", "Score", "Research insight", "Draft", "Status"],
    ...leads.map((l) => [l.name, l.location, l.site, l.fit, l.score, l.insight, l.draft, l.status]),
  ];
  const blob = new Blob(["﻿" + rows.map((r) => r.map(cell).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "leadflow-pipeline.csv";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function timeAgo(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const s = Math.max(0, (Date.now() - t) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
