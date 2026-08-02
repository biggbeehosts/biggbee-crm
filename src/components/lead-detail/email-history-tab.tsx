import type { Lead } from "@/types";
import { Card, CardContent } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDate } from "@/lib/utils/date";
import { Mail } from "lucide-react";

export function EmailHistoryTab({ lead }: { lead: Lead }) {
  if (!lead.lastEmailDate) {
    return <EmptyState icon={Mail} title="No emails sent yet" description="This lead hasn't been contacted by the outreach workflow." />;
  }

  return (
    <Card>
      <CardContent className="p-0">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border-subtle text-xs text-text-tertiary">
              <th className="px-5 py-3 font-medium">Sent</th>
              <th className="px-5 py-3 font-medium">Subject</th>
              <th className="px-5 py-3 font-medium">Variant</th>
              <th className="px-5 py-3 font-medium">Style</th>
              <th className="px-5 py-3 font-medium">Service</th>
              <th className="px-5 py-3 font-medium">Demo</th>
              <th className="px-5 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-border-subtle last:border-0">
              <td className="px-5 py-3 text-text-tertiary">{formatDate(lead.lastEmailDate)}</td>
              <td className="px-5 py-3 text-text-primary">
                {lead.lastEmailSubject || "—"}
                {lead.alternativeSubject && <p className="mt-0.5 text-xs text-text-tertiary">Alt: {lead.alternativeSubject}</p>}
              </td>
              <td className="px-5 py-3 text-text-secondary">{lead.subjectVariant ? <Badge variant="outline">{lead.subjectVariant}</Badge> : "—"}</td>
              <td className="px-5 py-3 text-text-secondary">{lead.emailStyle || "—"}</td>
              <td className="px-5 py-3 text-text-secondary">{lead.serviceOffered || "—"}</td>
              <td className="px-5 py-3 text-text-secondary">{lead.demoVideoAttached ? lead.demoVideoName || "Attached" : "Not included"}</td>
              <td className="px-5 py-3">
                <StatusBadge status={lead.status} />
              </td>
            </tr>
          </tbody>
        </table>
        <p className="border-t border-border-subtle px-5 py-3 text-xs text-text-tertiary">
          Follow-up stage {lead.followUpCount} of 3 · Only the latest send is tracked per lead in the current sheet schema; earlier sends
          are summarized in Lead Memory.
        </p>
      </CardContent>
    </Card>
  );
}
