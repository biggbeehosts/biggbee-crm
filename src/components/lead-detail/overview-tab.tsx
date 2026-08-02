import type { Lead } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfidenceBadge } from "@/components/ui/status-badge";
import { checkDemoUrlHealth } from "@/lib/utils/cloudinary";
import { Badge } from "@/components/ui/badge";

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] font-medium text-text-tertiary">{label}</p>
      <p className="mt-0.5 text-sm text-text-primary">{value || <span className="text-text-tertiary">—</span>}</p>
    </div>
  );
}

export function OverviewTab({ lead }: { lead: Lead }) {
  const demoHealth = checkDemoUrlHealth(lead.demoWatchUrl);

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>Company Details</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Business Type" value={lead.businessType} />
          <Field label="Lead Generation Type" value={lead.leadGenerationType} />
          <Field label="Industry" value={lead.industry} />
          <Field label="Country" value={lead.country} />
          <Field label="Website" value={lead.website} />
          <Field label="Phone" value={lead.phone} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>AI Strategist Output</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <p className="text-[11px] font-medium text-text-tertiary">Confidence</p>
            <div className="mt-1">
              <ConfidenceBadge value={lead.confidence} />
            </div>
          </div>
          <Field label="Selected Service" value={lead.serviceOffered} />
          <Field label="Email Style" value={lead.emailStyle} />
          <Field label="Subject Variant" value={lead.subjectVariant} />
          <div>
            <p className="text-[11px] font-medium text-text-tertiary">Demo Status</p>
            <div className="mt-1 flex flex-wrap gap-1.5">
              <Badge variant={lead.demoRecommended ? "accent" : "outline"}>{lead.demoRecommended ? "Demo recommended" : "No demo recommended"}</Badge>
              {lead.demoRecommended && (
                <Badge variant={demoHealth === "ok" ? "success" : demoHealth === "missing" ? "warning" : "danger"}>
                  {demoHealth === "ok" ? "Link healthy" : demoHealth === "missing" ? "No link on file" : "Invalid link"}
                </Badge>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="lg:col-span-3">
        <CardHeader>
          <CardTitle>AI Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm leading-relaxed text-text-secondary">
            {lead.aiSummary || "No AI summary recorded for this lead yet -- it will populate after the first outreach run."}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
