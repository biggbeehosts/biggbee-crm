"use client";

import type { Lead } from "@/types";
import { Drawer, DrawerBody, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription } from "@/components/ui/drawer";
import { StatusBadge } from "@/components/ui/status-badge";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDateTime } from "@/lib/utils/date";
import { FileText } from "lucide-react";

export function EmailPreviewDrawer({ lead, open, onOpenChange }: { lead: Lead | null; open: boolean; onOpenChange: (v: boolean) => void }) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        {lead && (
          <>
            <DrawerHeader>
              <DrawerTitle>{lead.company}</DrawerTitle>
              <DrawerDescription>{lead.email}</DrawerDescription>
            </DrawerHeader>
            <DrawerBody className="space-y-5">
              <div className="flex flex-wrap gap-1.5">
                <StatusBadge status={lead.status} />
                {lead.serviceOffered && <Badge variant="accent">{lead.serviceOffered}</Badge>}
                {lead.emailStyle && <Badge variant="outline">{lead.emailStyle} style</Badge>}
                {lead.subjectVariant && <Badge variant="outline">{lead.subjectVariant} subject</Badge>}
              </div>

              <div>
                <p className="text-[11px] font-medium text-text-tertiary">Subject</p>
                <p className="mt-0.5 text-sm text-text-primary">{lead.lastEmailSubject || "—"}</p>
                {lead.alternativeSubject && (
                  <p className="mt-1 text-xs text-text-tertiary">Alternative variant: {lead.alternativeSubject}</p>
                )}
              </div>

              <div>
                <p className="text-[11px] font-medium text-text-tertiary">Sent</p>
                <p className="mt-0.5 text-sm text-text-primary">{formatDateTime(lead.lastEmailDate)}</p>
              </div>

              <div>
                <p className="text-[11px] font-medium text-text-tertiary">Demo</p>
                <p className="mt-0.5 text-sm text-text-primary">
                  {lead.demoVideoAttached ? lead.demoVideoName || "Included" : lead.demoRecommended ? "Recommended but not available" : "Not applicable"}
                </p>
              </div>

              <div>
                <p className="mb-2 text-[11px] font-medium text-text-tertiary">Email Body</p>
                <EmptyState
                  icon={FileText}
                  title="Full email body not stored"
                  description="The Leads sheet tracks the subject and metadata for the latest send, not the full HTML body. Wire up a 'Last Email Body' column to preview it here."
                  className="py-8"
                />
              </div>
            </DrawerBody>
          </>
        )}
      </DrawerContent>
    </Drawer>
  );
}
