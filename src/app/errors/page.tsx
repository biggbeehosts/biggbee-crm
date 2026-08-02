export const dynamic = "force-dynamic";

import { getErrors } from "@/lib/data/repository";
import { PageHeader } from "@/components/layout/page-header";
import { ErrorsView } from "@/components/errors/errors-view";

export default async function ErrorsPage() {
  const errors = await getErrors();

  return (
    <div>
      <PageHeader title="Errors" subtitle="Operational log from the n8n workflow's Errors sheet" />
      <ErrorsView errors={errors} />
    </div>
  );
}
