export const dynamic = "force-dynamic";

import { Clapperboard } from "lucide-react";
import { getDemoLibrary } from "@/lib/data/demo-library-store";
import { getCampaigns } from "@/lib/data/campaigns-store";
import { countCampaignDemoUsage } from "@/lib/calculations/demo-match";
import { getActiveStorageProvider } from "@/lib/storage";
import { PageHeader } from "@/components/layout/page-header";
import { DemoLibraryView } from "@/components/demo-library/demo-library-view";

export default async function DemoLibraryPage() {
  const [demos, campaigns] = await Promise.all([getDemoLibrary(), getCampaigns()]);
  const usageCounts = countCampaignDemoUsage(campaigns);
  const storageConfigured = getActiveStorageProvider().isConfigured();

  return (
    <div>
      <PageHeader
        title="Demo Library"
        subtitle="Cloudinary-backed source of truth -- upload here and it's available to email automation immediately, no Sheet editing needed"
        icon={Clapperboard}
        tone="purple"
      />
      <DemoLibraryView demos={demos} usageCounts={Object.fromEntries(usageCounts)} storageConfigured={storageConfigured} />
    </div>
  );
}
