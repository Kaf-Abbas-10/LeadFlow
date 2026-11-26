"use client";

import { useLeadFlow } from "./LeadFlowProvider";
import { Card, Icon, Spinner, btn } from "./ui";

export function Setup() {
  const { health, schedule, connected, connect } = useLeadFlow();
  const i = health?.integrations;

  const services = [
    { name: "Gemini", role: "Scores fit and writes each draft", key: "GEMINI_API_KEY", on: i?.gemini, required: true },
    { name: "Firecrawl", role: "Finds companies on the web and reads their sites", key: "FIRECRAWL_API_KEY", on: i?.firecrawl, required: false },
    { name: "Apollo", role: "Company search (needs Company Search access)", key: "APOLLO_API_KEY", on: i?.apollo, required: false },
  ];

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-[30px] leading-tight font-bold">Connections</h1>
          <p className="mt-1 text-[15px] text-muted">API keys live in the backend <code className="rounded bg-soft px-1 text-[13px]">.env</code></p>
        </div>
        <button className={btn.ghost} onClick={connect} disabled={connected === null}>
          {connected === null ? <Spinner /> : <Icon name="undo" className="h-4 w-4" />} Recheck
        </button>
      </header>

      <div className={`flex items-center gap-3 rounded-2xl px-5 py-4 ring-1 ${connected ? "bg-mint-soft ring-mint/20" : connected === false ? "bg-danger-soft ring-danger/20" : "bg-card ring-line"}`}>
        <span className={`h-2.5 w-2.5 rounded-full ${connected ? "bg-mint" : connected === false ? "bg-danger" : "bg-amber"}`} />
        <p className="text-sm font-bold">
          {connected ? "LeadFlow API connected" : connected === false ? "LeadFlow API offline: start the backend, then Recheck" : "Checking the API…"}
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        {services.map((s) => (
          <Card key={s.name} className="p-5">
            <div className="flex items-center justify-between">
              <p className="font-display text-lg font-bold">{s.name}</p>
              <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${s.on ? "bg-mint-soft text-mint" : s.required ? "bg-amber-soft text-amber" : "bg-soft text-muted"}`}>
                {health ? (s.on ? "Connected" : s.required ? "Required" : "Not set") : "–"}
              </span>
            </div>
            <p className="mt-1.5 text-sm text-muted">{s.role}</p>
            <code className="mt-4 block truncate rounded-lg bg-bg px-3 py-2 text-xs font-semibold text-ink ring-1 ring-line">{s.key}</code>
          </Card>
        ))}
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <Card className="p-6">
          <h2 className="font-display text-lg font-bold">Connect a provider</h2>
          <ol className="mt-4 space-y-3 text-sm">
            {[
              <>Copy <code className="rounded bg-soft px-1">.env.example</code> to <code className="rounded bg-soft px-1">.env</code> in the LeadFlow folder.</>,
              <>Add <code className="rounded bg-soft px-1">GEMINI_API_KEY</code>, plus <code className="rounded bg-soft px-1">FIRECRAWL_API_KEY</code> for web search or <code className="rounded bg-soft px-1">APOLLO_API_KEY</code> for Apollo.</>,
              <>Restart the backend, then press <b>Recheck</b>.</>,
            ].map((step, n) => (
              <li key={n} className="flex gap-3">
                <span className="tabular flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-signal-soft text-xs font-bold text-signal-strong">{n + 1}</span>
                <span className="pt-0.5 text-muted">{step}</span>
              </li>
            ))}
          </ol>
          <p className="mt-4 text-xs text-muted">Uses provider credits. CSV imports still need Gemini.</p>
        </Card>

        <Card className="p-6">
          <h2 className="font-display text-lg font-bold">Daily schedule</h2>
          {schedule ? (
            <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-6 gap-y-2.5 text-sm">
              <dt className="text-muted">Status</dt>
              <dd className="font-bold">{schedule.enabled ? <span className="text-mint">On</span> : "Off"}</dd>
              <dt className="text-muted">Runs at</dt>
              <dd className="tabular font-semibold">{String(schedule.hour).padStart(2, "0")}:00 · {schedule.timezone}</dd>
              <dt className="text-muted">Target</dt>
              <dd className="font-semibold">{schedule.target}</dd>
              <dt className="text-muted">Source</dt>
              <dd className="font-semibold capitalize">{schedule.source}</dd>
            </dl>
          ) : (
            <p className="mt-4 text-sm text-muted">{connected === false ? "Unavailable while offline." : "Loading…"}</p>
          )}
          <p className="mt-4 text-xs text-muted">
            Off by default. Turn on with <code className="rounded bg-soft px-1">SCHEDULER_ENABLED=true</code>.
          </p>
        </Card>
      </div>

      <Card className="p-6">
        <h2 className="font-display text-lg font-bold">Safety by design</h2>
        <ul className="mt-3 grid gap-x-8 gap-y-2.5 text-sm text-muted sm:grid-cols-2">
          {[
            "You approve every draft",
            "No real emails are sent",
            "Private addresses are blocked",
            "Local demo, no user accounts",
          ].map((t) => (
            <li key={t} className="flex gap-2.5"><span className="mt-0.5 text-mint"><Icon name="check" className="h-4 w-4" /></span>{t}</li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
