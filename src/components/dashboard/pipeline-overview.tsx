import Link from "next/link";
import type { PipelineCounts } from "@/types";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { PIPELINE_STAGES } from "@/types";

const STAGE_BAR: Record<string, string> = {
  New: "bg-slate-400",
  Contacted: "bg-sky-400",
  Interested: "bg-amber-400",
  "Meeting Booked": "bg-violet-400",
  Customer: "bg-emerald-400",
  Failed: "bg-rose-400",
  Unsubscribed: "bg-zinc-500",
};

export function PipelineOverview({ counts }: { counts: PipelineCounts }) {
  const total = Object.values(counts).reduce((a, b) => a + b, 0) || 1;

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Pipeline Overview</CardTitle>
          <CardDescription>Leads by stage</CardDescription>
        </div>
        <Link href="/pipeline" className="text-xs font-medium text-accent hover:underline">
          Open board
        </Link>
      </CardHeader>
      <div className="space-y-3.5 px-5 pb-5">
        {PIPELINE_STAGES.map((stage) => {
          const count = counts[stage];
          return (
            <div key={stage}>
              <div className="mb-1 flex items-center justify-between text-xs">
                <span className="text-text-secondary">{stage}</span>
                <span className="font-medium text-text-primary">{count}</span>
              </div>
              <Progress value={(count / total) * 100} barClassName={STAGE_BAR[stage]} />
            </div>
          );
        })}
      </div>
    </Card>
  );
}
