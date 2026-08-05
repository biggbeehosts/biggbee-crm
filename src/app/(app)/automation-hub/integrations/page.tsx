import { Plug } from "lucide-react";
import { getAllProviderHealth } from "@/lib/providers/registry";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const CATEGORY_LABEL: Record<string, string> = {
  storage: "Storage",
  "workflow-engine": "Workflow Engine",
  spreadsheet: "Spreadsheet",
  scraping: "Scraping",
  ai: "AI",
  email: "Email",
};

export default async function IntegrationsPage() {
  const providers = await getAllProviderHealth();

  return (
    <div>
      <PageHeader
        title="Integrations"
        subtitle="Every external service the CRM calls directly, through one provider-adapter interface -- swapping a provider later never touches business logic."
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {providers.map((p) => (
          <Card key={p.id} className="flex flex-col gap-3 p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-text-primary">{p.name}</p>
                <p className="mt-0.5 text-xs text-text-tertiary">{CATEGORY_LABEL[p.category] ?? p.category}</p>
              </div>
              <div className="flex flex-col items-end gap-1.5">
                <Badge variant={p.configured ? "success" : "warning"}>{p.configured ? "Configured" : "Not configured"}</Badge>
                {p.configured && <Badge variant={p.connected ? "success" : "danger"}>{p.connected ? "Connected" : "Unreachable"}</Badge>}
              </div>
            </div>
            {p.detail && <p className="text-xs text-text-secondary">{p.detail}</p>}
            {p.error && <p className="rounded-md bg-danger/10 px-2.5 py-1.5 text-xs text-danger">{p.error}</p>}
          </Card>
        ))}
      </div>

      <Card className="mt-4 flex items-start gap-2.5 p-4">
        <Plug className="mt-0.5 h-4 w-4 shrink-0 text-text-tertiary" />
        <p className="text-xs text-text-tertiary">
          Apify, OpenAI, and SMTP run entirely inside n8n&apos;s own workflows today -- the CRM holds no credential for them, so there is nothing to
          check here yet. Adding a direct integration later is a new adapter implementing the same <code>ProviderAdapter</code> interface, not a
          change to this page.
        </p>
      </Card>
    </div>
  );
}
