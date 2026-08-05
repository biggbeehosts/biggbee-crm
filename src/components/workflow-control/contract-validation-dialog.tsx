"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck, CheckCircle2, XCircle, AlertTriangle, MinusCircle } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { validateContractAction, type RegistryKind } from "@/lib/actions/workflow-registry";
import type { ContractValidationReport, ContractCheckStatus } from "@/types";
import { cn } from "@/lib/utils/cn";

const ICONS: Record<ContractCheckStatus, React.ReactNode> = {
  pass: <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />,
  fail: <XCircle className="h-4 w-4 shrink-0 text-danger" />,
  warn: <AlertTriangle className="h-4 w-4 shrink-0 text-warning" />,
  skipped: <MinusCircle className="h-4 w-4 shrink-0 text-text-tertiary" />,
};

export function ContractValidationDialog({ kind, id }: { kind: RegistryKind; id: string }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [running, setRunning] = React.useState(false);
  const [report, setReport] = React.useState<ContractValidationReport | null>(null);

  async function run() {
    setRunning(true);
    const result = await validateContractAction(kind, id);
    setReport(result);
    setRunning(false);
    router.refresh();
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next && !report) run();
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          <ShieldCheck className="h-3.5 w-3.5" /> Validate Contract
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Contract validation</DialogTitle>
          <DialogDescription>Each check runs independently -- a failing check never hides behind an overall pass/fail.</DialogDescription>
        </DialogHeader>

        {running && <p className="text-sm text-text-tertiary">Running checks…</p>}

        {!running && report && (
          <div className="space-y-2">
            {report.checks.map((check) => (
              <div key={check.id} className="flex items-start gap-2.5 rounded-lg border border-border-subtle bg-panel p-2.5">
                {ICONS[check.status]}
                <div className="min-w-0">
                  <p className="text-xs font-medium text-text-primary">{check.label}</p>
                  <p className="mt-0.5 text-xs text-text-tertiary">{check.detail}</p>
                </div>
              </div>
            ))}
            <p className={cn("text-xs font-medium", report.overallPass ? "text-success" : "text-danger")}>
              {report.overallPass ? "All checks passed -- this assignment can be enabled." : "One or more checks failed -- this assignment cannot be enabled until fixed."}
            </p>
          </div>
        )}

        <DialogFooter>
          <Button variant="secondary" size="sm" onClick={run} disabled={running}>
            {running ? "Running…" : "Re-run checks"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
