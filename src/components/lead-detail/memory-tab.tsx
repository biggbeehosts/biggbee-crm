import type { LeadMemory } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/utils/date";
import { BrainCircuit } from "lucide-react";

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] font-medium text-text-tertiary">{label}</p>
      <p className="mt-0.5 text-sm text-text-primary">{value || <span className="text-text-tertiary">—</span>}</p>
    </div>
  );
}

export function MemoryTab({ memory }: { memory: LeadMemory | undefined }) {
  if (!memory) {
    return <EmptyState icon={BrainCircuit} title="No memory recorded yet" description="Lead memory populates after the first outreach email is sent." />;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>AI Lead Memory</CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Services Discussed" value={memory.servicesDiscussed} />
        <Field label="Pain Points" value={memory.painPoints} />
        <Field
          label="Interest Level"
          value={memory.interestLevel ? <Badge variant="accent">{memory.interestLevel}</Badge> : undefined}
        />
        <Field label="Meeting Booked" value={<Badge variant={memory.meetingBooked ? "success" : "outline"}>{memory.meetingBooked ? "Yes" : "No"}</Badge>} />
        <Field label="Demo Sent" value={<Badge variant={memory.demoSent ? "success" : "outline"}>{memory.demoSent ? "Yes" : "No"}</Badge>} />
        <Field label="Last Subject" value={memory.lastSubject} />
        <Field label="Updated At" value={formatDateTime(memory.updatedAt)} />
        <Field label="Last Contacted At" value={formatDateTime(memory.lastContactedAt)} />
        <div className="sm:col-span-2">
          <p className="text-[11px] font-medium text-text-tertiary">Last Summary</p>
          <p className="mt-0.5 text-sm leading-relaxed text-text-secondary">{memory.lastSummary || "—"}</p>
        </div>
      </CardContent>
    </Card>
  );
}
