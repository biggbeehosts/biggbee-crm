export const dynamic = "force-dynamic";

import { MailQuestion } from "lucide-react";
import { getUnknownSenders } from "@/lib/data/repository";
import { PageHeader } from "@/components/layout/page-header";
import { UnknownSendersView } from "@/components/unknown-senders/unknown-senders-view";
import { DEFAULT_WORKSPACE_ID } from "@/types";

export default async function UnknownSendersPage() {
  const senders = await getUnknownSenders(DEFAULT_WORKSPACE_ID);

  return (
    <div>
      <PageHeader title="Unknown Senders" subtitle="Replies the workflow couldn't match to a known lead" icon={MailQuestion} tone="warning" />
      <UnknownSendersView senders={senders} />
    </div>
  );
}
