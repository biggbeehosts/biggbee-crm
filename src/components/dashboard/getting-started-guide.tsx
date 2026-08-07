"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, Circle, ChevronLeft, ChevronRight, Compass, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { IconBadge } from "@/components/ui/icon-badge";
import { cn } from "@/lib/utils/cn";
import { dismissSetupGuideAction } from "@/lib/auth/actions";

export type GuideStepState = "complete" | "recommended" | "needs-setup";

export interface GuideStep {
  id: string;
  title: string;
  description: string;
  state: GuideStepState;
  href: string;
}

const STATE_META: Record<GuideStepState, { label: string; badge: "success" | "warning" | "outline" }> = {
  complete: { label: "Complete", badge: "success" },
  recommended: { label: "Recommended", badge: "outline" },
  "needs-setup": { label: "Needs setup", badge: "warning" },
};

/**
 * First-login onboarding -- shown instead of any error history (Section 13/14 of the polish
 * brief). Step state is computed server-side from real, already-fetched Dashboard data (see
 * dashboard/page.tsx's buildSetupSteps) -- nothing here is fabricated. "Skip for now" only hides
 * it for this page load (local state); "Dismiss" persists via dismissSetupGuideAction so it
 * doesn't auto-show again -- see Settings for the manual reopen entry.
 */
export function GettingStartedGuide({ steps }: { steps: GuideStep[] }) {
  const router = useRouter();
  const [hidden, setHidden] = React.useState(false);
  const [viewAll, setViewAll] = React.useState(false);
  const [index, setIndex] = React.useState(() => Math.max(0, steps.findIndex((s) => s.state !== "complete")));
  const [dismissing, setDismissing] = React.useState(false);

  if (hidden) return null;

  const completedCount = steps.filter((s) => s.state === "complete").length;
  const step = steps[index];

  async function handleDismiss() {
    setDismissing(true);
    await dismissSetupGuideAction();
    setDismissing(false);
    setHidden(true);
    router.refresh();
  }

  return (
    <Card level={1} glow className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <IconBadge icon={Compass} tone="lime" />
          <div>
            <p className="text-sm font-semibold text-text-primary">Getting Started</p>
            <p className="text-xs text-text-tertiary">
              {completedCount}/{steps.length} steps complete
            </p>
          </div>
        </div>
        <button onClick={() => setHidden(true)} className="shrink-0 rounded p-1 text-text-tertiary hover:text-text-primary" aria-label="Skip for now">
          <X className="h-4 w-4" />
        </button>
      </div>

      {viewAll ? (
        <ul className="mt-4 divide-y divide-border-subtle">
          {steps.map((s) => (
            <li key={s.id} className="flex items-center gap-3 py-2">
              {s.state === "complete" ? (
                <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
              ) : (
                <Circle className="h-4 w-4 shrink-0 text-text-tertiary" />
              )}
              <Link href={s.href} className="min-w-0 flex-1 text-xs font-medium text-text-primary hover:text-accent">
                {s.title}
              </Link>
              <Badge variant={STATE_META[s.state].badge}>{STATE_META[s.state].label}</Badge>
            </li>
          ))}
        </ul>
      ) : (
        <div className="mt-4">
          <div className="mb-2 flex items-center gap-1.5">
            {steps.map((s, i) => (
              <span
                key={s.id}
                className={cn(
                  "h-1 flex-1 rounded-full",
                  i === index ? "bg-accent" : s.state === "complete" ? "bg-success/50" : "bg-border-subtle"
                )}
              />
            ))}
          </div>
          <div className="rounded-xl border border-border-subtle bg-panel p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] font-medium text-text-tertiary">
                Step {index + 1} of {steps.length}
              </p>
              <Badge variant={STATE_META[step.state].badge}>{STATE_META[step.state].label}</Badge>
            </div>
            <p className="mt-1.5 text-sm font-semibold text-text-primary">{step.title}</p>
            <p className="mt-0.5 text-xs text-text-secondary">{step.description}</p>
            <Button variant="secondary" size="sm" asChild className="mt-3">
              <Link href={step.href}>Open</Link>
            </Button>
          </div>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border-subtle pt-3.5">
        {!viewAll && (
          <>
            <Button variant="ghost" size="sm" onClick={() => setIndex((i) => Math.max(0, i - 1))} disabled={index === 0}>
              <ChevronLeft className="h-3.5 w-3.5" /> Previous
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setIndex((i) => Math.min(steps.length - 1, i + 1))} disabled={index === steps.length - 1}>
              Next <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </>
        )}
        <Button variant="ghost" size="sm" onClick={() => setViewAll((v) => !v)}>
          {viewAll ? "Back to steps" : "View all"}
        </Button>
        <div className="ml-auto flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => setHidden(true)}>
            Skip for now
          </Button>
          <Button variant="secondary" size="sm" onClick={handleDismiss} disabled={dismissing}>
            {dismissing ? "Dismissing…" : "Dismiss setup guide"}
          </Button>
        </div>
      </div>
    </Card>
  );
}
