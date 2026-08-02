"use client";

import * as React from "react";
import type { Lead, PipelineStage } from "@/types";
import { PIPELINE_STAGES } from "@/types";
import { toPipelineStage } from "@/lib/utils/status";
import { KanbanCard } from "./kanban-card";
import { Badge } from "@/components/ui/badge";
import { AlertCircle } from "lucide-react";
import { updateLeadStatusAction } from "@/lib/actions/leads";

const STAGE_ACCENT: Record<PipelineStage, string> = {
  New: "border-t-slate-400",
  Contacted: "border-t-sky-400",
  Interested: "border-t-amber-400",
  "Meeting Booked": "border-t-violet-400",
  Customer: "border-t-emerald-400",
  Failed: "border-t-rose-400",
  Unsubscribed: "border-t-zinc-500",
};

export function KanbanBoard({ leads }: { leads: Lead[] }) {
  const [localLeads, setLocalLeads] = React.useState(leads);
  const [draggingEmail, setDraggingEmail] = React.useState<string | null>(null);
  const [dragOverStage, setDragOverStage] = React.useState<PipelineStage | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);

  // Sync optimistic state when the server sends fresh leads (adjust-state-during-render pattern).
  const [prevLeads, setPrevLeads] = React.useState(leads);
  if (prevLeads !== leads) {
    setPrevLeads(leads);
    setLocalLeads(leads);
  }

  const columns = React.useMemo(() => {
    const map = new Map<PipelineStage, Lead[]>(PIPELINE_STAGES.map((s) => [s, [] as Lead[]]));
    for (const lead of localLeads) map.get(toPipelineStage(lead.status))!.push(lead);
    return map;
  }, [localLeads]);

  async function handleDrop(stage: PipelineStage) {
    setDragOverStage(null);
    const email = draggingEmail;
    setDraggingEmail(null);
    if (!email) return;

    const current = localLeads.find((l) => l.email === email);
    if (!current || toPipelineStage(current.status) === stage) return;

    const previousStatus = current.status;
    setLocalLeads((prev) => prev.map((l) => (l.email === email ? { ...l, status: stage } : l)));

    const result = await updateLeadStatusAction(email, stage);
    if (!result.success) {
      setLocalLeads((prev) => prev.map((l) => (l.email === email ? { ...l, status: previousStatus } : l)));
      setNotice(result.message);
    }
  }

  return (
    <div>
      {notice && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-warning/20 bg-warning/10 px-3 py-2 text-xs text-warning">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          {notice}
          <button className="ml-auto text-warning/70 hover:text-warning" onClick={() => setNotice(null)}>
            Dismiss
          </button>
        </div>
      )}
      <div className="flex gap-4 overflow-x-auto pb-2">
        {PIPELINE_STAGES.map((stage) => {
          const items = columns.get(stage) ?? [];
          return (
            <div
              key={stage}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOverStage(stage);
              }}
              onDragLeave={() => setDragOverStage((s) => (s === stage ? null : s))}
              onDrop={(e) => {
                e.preventDefault();
                handleDrop(stage);
              }}
              className={`flex w-72 shrink-0 flex-col rounded-xl border border-t-2 bg-surface transition-colors ${STAGE_ACCENT[stage]} ${
                dragOverStage === stage ? "border-border-strong bg-panel" : "border-border-subtle"
              }`}
            >
              <div className="flex items-center justify-between px-3 py-2.5">
                <p className="text-xs font-semibold text-text-primary">{stage}</p>
                <Badge>{items.length}</Badge>
              </div>
              <div className="flex-1 space-y-2 overflow-y-auto px-3 pb-3" style={{ minHeight: 120, maxHeight: 560 }}>
                {items.map((lead) => (
                  <div
                    key={lead.email}
                    draggable
                    onDragStart={() => setDraggingEmail(lead.email)}
                    onDragEnd={() => setDraggingEmail(null)}
                  >
                    <KanbanCard lead={lead} dragging={draggingEmail === lead.email} />
                  </div>
                ))}
                {items.length === 0 && <p className="py-6 text-center text-[11px] text-text-tertiary">No leads in this stage</p>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
