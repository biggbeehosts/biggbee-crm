export const dynamic = "force-dynamic";

import { Palette } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { RedesignView } from "@/components/website-redesign/redesign-view";
import { pageWorkspaceContext } from "@/lib/auth/workspace-context";
import { describeConfig, getRedesignConfig } from "@/lib/redesign/config";
import { listRedesignCampaigns, toPublicCampaign } from "@/lib/redesign/store";

/**
 * Website Redesign Outreach -- a side feature inside the existing CRM shell. No Google or n8n
 * call happens while this page renders (so it can never slow down or break on a Sheets/Drive
 * outage); live checks run only when the operator presses "Check connections & scan". Only the
 * NAMES of settings and whether each is set reach the browser -- never a value, ID or secret.
 */
export default async function WebsiteRedesignPage() {
  const { workspaceId } = await pageWorkspaceContext();
  const config = getRedesignConfig(workspaceId);
  const described = describeConfig(config);
  const campaigns = await listRedesignCampaigns(workspaceId);

  return (
    <div>
      <PageHeader
        title="Website Redesign Outreach"
        subtitle="Send a prepared redesign concept, with its screenshots, to each business -- separate from your regular cold-email campaigns"
        icon={Palette}
        tone="teal"
      />
      <RedesignView
        described={described}
        limits={
          config
            ? {
                delaySeconds: config.settings.delaySeconds,
                hourlyLimit: config.settings.hourlyLimit,
                dailyLimit: config.settings.dailyLimit,
                maxScreenshots: config.settings.maxScreenshots,
                maxPerRun: config.settings.maxPerRun,
              }
            : null
        }
        campaigns={campaigns.map(toPublicCampaign)}
      />
    </div>
  );
}
