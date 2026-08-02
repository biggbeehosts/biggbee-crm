export const dynamic = "force-dynamic";

import { getDemoLibrary } from "@/lib/data/repository";
import { PageHeader } from "@/components/layout/page-header";
import { DemoLibraryView } from "@/components/demo-library/demo-library-view";

export default async function DemoLibraryPage() {
  const demos = await getDemoLibrary();

  return (
    <div>
      <PageHeader
        title="Demo Library"
        subtitle="Cloudinary-hosted demo videos matched to leads by the AI Strategist"
      />
      <DemoLibraryView demos={demos} />
    </div>
  );
}
