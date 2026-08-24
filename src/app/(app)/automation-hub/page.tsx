import type { ComponentType } from "react";
import Link from "next/link";
import { Cable, Clapperboard, BookOpen, Plug, SlidersHorizontal, ArrowRight, LayoutGrid } from "lucide-react";
import { getWorkflowIntegrations } from "@/lib/data/workflow-registry-store";
import { getDemoLibrary } from "@/lib/data/demo-library-store";
import { getWebsiteRegistry } from "@/lib/data/website-registry-store";
import { getAllProviderHealth } from "@/lib/providers/registry";
import { computeDemoValidationStatus } from "@/lib/utils/cloudinary";
import { isAdminApiConfigured } from "@/lib/n8n/admin-client";
import { isSheetsConfigured, getDataMode } from "@/lib/data/config";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { pageWorkspaceContext } from "@/lib/auth/workspace-context";

function HealthCard({
  href,
  icon: Icon,
  title,
  primary,
  secondary,
  tone,
}: {
  href: string;
  icon: ComponentType<{ className?: string }>;
  title: string;
  primary: string;
  secondary: string;
  tone: "lime" | "warning" | "outline";
}) {
  return (
    <Link href={href}>
      <Card level={2} className="flex h-full flex-col gap-3 p-4 transition-all hover:-translate-y-px hover:border-border-strong">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent-strong">
              <Icon className="h-4.5 w-4.5" />
            </div>
            <p className="text-sm font-semibold text-text-primary">{title}</p>
          </div>
          <Badge variant={tone}>{secondary}</Badge>
        </div>
        <p className="text-2xl font-semibold tracking-tight text-text-primary">{primary}</p>
        <p className="mt-auto flex items-center gap-1 text-xs font-medium text-accent">
          View <ArrowRight className="h-3 w-3" />
        </p>
      </Card>
    </Link>
  );
}

/** Plain helper (not a component/hook) so the impure Date.now() read isn't flagged as happening
 *  during render -- it's a one-off "was this synced in the last `withinMs`" check, recomputed
 *  fresh on every request the same as everything else on this server-rendered page. */
function syncedWithin(lastSyncAt: string | null, withinMs: number): boolean {
  if (!lastSyncAt) return false;
  return Date.now() - new Date(lastSyncAt).getTime() <= withinMs;
}

export default async function AutomationHubOverviewPage() {
  const { workspaceId } = await pageWorkspaceContext();
  const [integrations, demos, websites, providers] = await Promise.all([
    getWorkflowIntegrations(),
    getDemoLibrary(workspaceId),
    getWebsiteRegistry(),
    getAllProviderHealth(),
  ]);

  const activeIntegrations = integrations.filter((i) => i.active).length;

  const healthyDemos = demos.filter((d) => computeDemoValidationStatus(d) === "healthy").length;

  const syncedRecently = websites.filter((w) => syncedWithin(w.lastSyncAt, 24 * 60 * 60 * 1000)).length;

  const providersConfigured = providers.filter((p) => p.configured).length;

  const settingsChecks = [isSheetsConfigured() || getDataMode() === "mock", isAdminApiConfigured()];
  const settingsPassing = settingsChecks.filter(Boolean).length;

  return (
    <div>
      <PageHeader
        title="Automation Hub"
        subtitle="The single control center for every outreach automation -- everything below is registry-driven, no hardcoded per-automation pages."
        icon={LayoutGrid}
        tone="lime"
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <HealthCard
          href="/automation-hub/workflows"
          icon={Cable}
          title="Workflows"
          primary={`${activeIntegrations}/${integrations.length} active`}
          secondary={isAdminApiConfigured() ? "Admin API connected" : "Admin API not configured"}
          tone={isAdminApiConfigured() ? "lime" : "warning"}
        />
        <HealthCard
          href="/automation-hub/demo-library"
          icon={Clapperboard}
          title="Demo Library"
          primary={`${demos.length} demos`}
          secondary={`${healthyDemos} healthy`}
          tone={demos.length > 0 && healthyDemos === demos.length ? "lime" : "warning"}
        />
        <HealthCard
          href="/automation-hub/knowledge-base"
          icon={BookOpen}
          title="Knowledge Base"
          primary={`${websites.length} website${websites.length === 1 ? "" : "s"}`}
          secondary={`${syncedRecently} synced today`}
          tone={syncedRecently > 0 ? "lime" : "outline"}
        />
        <HealthCard
          href="/automation-hub/integrations"
          icon={Plug}
          title="Integrations"
          primary={`${providersConfigured}/${providers.length} configured`}
          secondary={providersConfigured === providers.length ? "All connected" : "Needs attention"}
          tone={providersConfigured === providers.length ? "lime" : "warning"}
        />
        <HealthCard
          href="/automation-hub/settings"
          icon={SlidersHorizontal}
          title="Settings"
          primary={`${settingsPassing}/${settingsChecks.length} checks passing`}
          secondary={settingsPassing === settingsChecks.length ? "Healthy" : "Needs attention"}
          tone={settingsPassing === settingsChecks.length ? "lime" : "warning"}
        />
      </div>
    </div>
  );
}
