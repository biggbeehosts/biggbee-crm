import Link from "next/link";
import type { Lead } from "@/types";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge, ConfidenceBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDate } from "@/lib/utils/date";
import { compareDatesEmptyLast } from "@/lib/utils/date";
import { Inbox } from "lucide-react";

export function LatestOutreachTable({ leads }: { leads: Lead[] }) {
  const recent = [...leads]
    .filter((l) => l.lastEmailDate)
    .sort((a, b) => -compareDatesEmptyLast(a.lastEmailDate, b.lastEmailDate))
    .slice(0, 8);

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Latest Outreach</CardTitle>
          <CardDescription>Most recently emailed leads</CardDescription>
        </div>
        <Link href="/outreach" className="text-xs font-medium text-accent hover:underline">
          View all
        </Link>
      </CardHeader>
      <div className="overflow-x-auto px-5 pb-5">
        {recent.length === 0 ? (
          <EmptyState icon={Inbox} title="No outreach yet" description="Sent emails will show up here." />
        ) : (
          <table className="w-full min-w-[640px] text-left text-xs">
            <thead>
              <tr className="text-text-tertiary">
                <th className="pb-2 font-medium">Company</th>
                <th className="pb-2 font-medium">Service</th>
                <th className="pb-2 font-medium">Status</th>
                <th className="pb-2 font-medium">Confidence</th>
                <th className="pb-2 font-medium">Sent</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {recent.map((lead) => (
                <tr key={lead.email} className="group">
                  <td className="py-2.5">
                    <Link href={`/leads/${encodeURIComponent(lead.email)}`} className="font-medium text-text-primary group-hover:text-accent">
                      {lead.company}
                    </Link>
                  </td>
                  <td className="py-2.5 text-text-secondary">{lead.serviceOffered || "—"}</td>
                  <td className="py-2.5">
                    <StatusBadge status={lead.status} />
                  </td>
                  <td className="py-2.5">
                    <ConfidenceBadge value={lead.confidence} />
                  </td>
                  <td className="py-2.5 text-text-tertiary">{formatDate(lead.lastEmailDate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </Card>
  );
}
