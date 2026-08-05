import { ShieldCheck } from "lucide-react";
import { isActionConfigured, isAdvancedUpdatesEnabled, N8N_ACTION_LABELS, type N8nActionKey } from "@/lib/n8n/config";
import { isAdminApiConfigured } from "@/lib/n8n/admin-client";
import { isSheetsConfigured, getDataMode } from "@/lib/data/config";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const ACTION_KEYS: N8nActionKey[] = ["runCampaign", "pauseCampaign", "resumeCampaign", "refreshKb", "retryFailed", "sync", "status"];

/**
 * Stage 6, Part 1/6: read-only summary of automation-relevant server config -- booleans only,
 * never values, same "honestly report not configured" posture the rest of lib/n8n/config.ts
 * already uses. No env var is editable from this page; changing one still means editing
 * .env.production and redeploying.
 */
export default async function AutomationHubSettingsPage() {
  const checks = [
    { label: "Data mode", value: getDataMode() === "mock" ? "Mock" : "Google Sheets (live)", ok: true },
    { label: "Google Sheets credentials", value: isSheetsConfigured() ? "Configured" : "Not configured", ok: isSheetsConfigured() || getDataMode() === "mock" },
    { label: "n8n Admin API (N8N_ADMIN_API_KEY)", value: isAdminApiConfigured() ? "Configured" : "Not configured", ok: isAdminApiConfigured() },
    { label: "Advanced Workflow Update", value: isAdvancedUpdatesEnabled() ? "Enabled" : "Disabled (default)", ok: true },
  ];

  return (
    <div>
      <PageHeader title="Automation Hub Settings" subtitle="Read-only configuration health for every automation on this CRM." />

      <Card className="mb-4">
        <CardContent className="divide-y divide-border-subtle p-0">
          {checks.map((c) => (
            <div key={c.label} className="flex items-center justify-between px-5 py-3 text-sm">
              <span className="text-text-secondary">{c.label}</span>
              <Badge variant={c.ok ? "success" : "warning"}>{c.value}</Badge>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <div className="flex items-center gap-2 border-b border-border-subtle px-5 py-3.5">
          <ShieldCheck className="h-4 w-4 text-text-tertiary" />
          <p className="text-sm font-semibold text-text-primary">n8n action webhooks</p>
        </div>
        <CardContent className="divide-y divide-border-subtle p-0">
          {ACTION_KEYS.map((key) => (
            <div key={key} className="flex items-center justify-between px-5 py-3 text-sm">
              <span className="text-text-secondary">{N8N_ACTION_LABELS[key]}</span>
              <Badge variant={isActionConfigured(key) ? "success" : "outline"}>{isActionConfigured(key) ? "Configured" : "Not set"}</Badge>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
