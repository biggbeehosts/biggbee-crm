"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Globe, Copy, Play, Download, Check, Trash2 } from "lucide-react";
import type { Campaign, Lead } from "@/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatusBadge, ConfidenceBadge } from "@/components/ui/status-badge";
import { initials } from "@/lib/utils/format";
import { resolveDownloadUrl } from "@/lib/utils/cloudinary";
import { deleteLeadAction } from "@/lib/actions/leads";
import { EditLeadDialog } from "./edit-lead-dialog";

export function LeadHeader({ lead, campaigns, campaignName }: { lead: Lead; campaigns: Campaign[]; campaignName: string | null }) {
  const router = useRouter();
  const [copied, setCopied] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);

  async function copyEmail() {
    await navigator.clipboard.writeText(lead.email);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  async function handleDelete() {
    if (!window.confirm(`Delete ${lead.company} (${lead.email})? This removes the lead from the Leads sheet and cannot be undone.`)) return;
    setDeleting(true);
    const result = await deleteLeadAction(lead.email);
    if (!result.success) {
      setDeleting(false);
      window.alert(result.message);
      return;
    }
    router.push("/leads");
    router.refresh();
  }

  const downloadUrl = resolveDownloadUrl(lead.demoWatchUrl, lead.demoDownloadUrl);

  return (
    <div className="mb-6 rounded-2xl border border-border-subtle bg-surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-lg font-semibold text-accent-strong">
            {initials(lead.company)}
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-lg font-semibold text-text-primary">{lead.company}</h1>
              <StatusBadge status={lead.status} />
              <ConfidenceBadge value={lead.confidence} />
            </div>
            <p className="mt-0.5 text-sm text-text-secondary">
              {lead.name} · {lead.email}
            </p>
            <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-text-tertiary">
              {lead.industry && <span>{lead.industry}</span>}
              {lead.country && <span>{lead.country}</span>}
              {lead.phone && <span>{lead.phone}</span>}
              {lead.serviceOffered && <span className="text-accent">{lead.serviceOffered}</span>}
            </div>
            <div className="mt-2">
              {campaignName ? <Badge variant="accent">{campaignName}</Badge> : <Badge variant="outline">No campaign assigned</Badge>}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2 border-t border-border-subtle pt-4">
        {lead.website && (
          <Button variant="secondary" size="sm" asChild>
            <a href={lead.website.startsWith("http") ? lead.website : `https://${lead.website}`} target="_blank" rel="noopener noreferrer">
              <Globe className="h-3.5 w-3.5" /> Open website
            </a>
          </Button>
        )}
        {lead.demoWatchUrl && (
          <Button variant="secondary" size="sm" asChild>
            <a href={lead.demoWatchUrl} target="_blank" rel="noopener noreferrer">
              <Play className="h-3.5 w-3.5" /> Watch demo
            </a>
          </Button>
        )}
        {downloadUrl && (
          <Button variant="secondary" size="sm" asChild>
            <a href={downloadUrl} target="_blank" rel="noopener noreferrer">
              <Download className="h-3.5 w-3.5" /> Download demo
            </a>
          </Button>
        )}
        <Button variant="secondary" size="sm" onClick={copyEmail}>
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? "Copied" : "Copy email"}
        </Button>
        <EditLeadDialog lead={lead} campaigns={campaigns} />
        <Button variant="secondary" size="sm" className="text-danger hover:text-danger" onClick={handleDelete} disabled={deleting}>
          <Trash2 className="h-3.5 w-3.5" /> {deleting ? "Deleting…" : "Delete lead"}
        </Button>
      </div>
    </div>
  );
}
