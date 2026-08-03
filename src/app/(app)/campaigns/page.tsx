export const dynamic = "force-dynamic";

import { getLeads } from "@/lib/data/repository";
import { getCampaigns } from "@/lib/data/campaigns-store";
import { getOptionListsSync } from "@/lib/data/options-store";
import { PageHeader } from "@/components/layout/page-header";
import { CampaignsView } from "@/components/campaigns/campaigns-view";
import { CampaignFormDialog } from "@/components/campaigns/campaign-form-dialog";

export default async function CampaignsPage() {
  const [leads, campaigns, options] = [await getLeads(), await getCampaigns(), getOptionListsSync()];

  return (
    <div>
      <PageHeader
        title="Campaigns"
        subtitle="Define what the current outreach run targets, and preview the selection before n8n sends anything"
        actions={<CampaignFormDialog options={options} />}
      />
      <CampaignsView campaigns={campaigns} leads={leads} options={options} />
    </div>
  );
}
