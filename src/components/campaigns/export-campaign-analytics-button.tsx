"use client";

import * as React from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { exportCampaignAnalyticsCsvAction } from "@/lib/actions/analytics";

/** Part N: "export campaign analytics" -- the server action already builds the CSV string;
 *  this just triggers a browser download, no client-side aggregation. */
export function ExportCampaignAnalyticsButton({ campaignId, campaignName }: { campaignId: string; campaignName: string }) {
  const [pending, setPending] = React.useState(false);

  async function handleExport() {
    setPending(true);
    try {
      const result = await exportCampaignAnalyticsCsvAction(campaignId);
      if (!result.success || !result.csv) return;
      const blob = new Blob([result.csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${campaignName.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-analytics.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } finally {
      setPending(false);
    }
  }

  return (
    <Button variant="outline" size="sm" className="w-full" onClick={handleExport} disabled={pending}>
      <Download className="h-3.5 w-3.5" />
      {pending ? "Exporting…" : "Export analytics (CSV)"}
    </Button>
  );
}
