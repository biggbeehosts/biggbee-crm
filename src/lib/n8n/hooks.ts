"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { getAutomationStatusAction, syncCrmAction, triggerN8nAction } from "./actions";
import type { N8nActionKey } from "./config";
import type { AutomationStatusResult } from "./types";
import { useToast } from "@/components/ui/toast";

/** Human labels used for client-side messages, so an unconfigured action never hits the server. */
const ACTION_LABELS: Record<string, string> = {
  runCampaign: "Run Campaign",
  pauseCampaign: "Pause Campaign",
  resumeCampaign: "Resume Campaign",
  refreshKb: "Refresh Knowledge Base",
  retryFailed: "Retry Failed Leads",
  sync: "Sync CRM",
};

/** Short guard against double-triggering the same workflow. Sync is local, so it needs none. */
const COOLDOWN_MS = 10_000;

export interface LastRunResult {
  action: N8nActionKey | "sync";
  label: string;
  triggeredAt: string;
}

/**
 * Client-side glue for the automation controls: pending state, cooldown, toast and UI refresh.
 * All webhook calls run server-side via server actions -- no n8n URL or key ever reaches
 * the browser.
 */
export function useN8nAction(configured?: Partial<Record<N8nActionKey, boolean>>) {
  const router = useRouter();
  const { toast } = useToast();
  const [pendingAction, setPendingAction] = React.useState<string | null>(null);
  const [cooldownUntil, setCooldownUntil] = React.useState<Record<string, number>>({});
  const [, forceTick] = React.useState(0);
  const [lastRunResult, setLastRunResult] = React.useState<LastRunResult | null>(null);

  /**
   * Synchronous guards. React state updates are async, so several clicks landing in the same
   * tick would all still observe `pendingAction === null` and each fire a webhook. Refs update
   * immediately, so they are what actually prevents a double-submit; the state above only
   * drives rendering.
   */
  const inFlightRef = React.useRef<string | null>(null);
  const cooldownRef = React.useRef<Record<string, number>>({});

  // Ticks only while a cooldown is outstanding; clears itself once the last one expires.
  React.useEffect(() => {
    if (Object.keys(cooldownUntil).length === 0) return;
    const id = window.setInterval(() => {
      forceTick((n) => n + 1);
      setCooldownUntil((prev) => {
        const now = Date.now();
        const next = Object.fromEntries(Object.entries(prev).filter(([, until]) => until > now));
        cooldownRef.current = next;
        return Object.keys(next).length === Object.keys(prev).length ? prev : next;
      });
    }, 500);
    return () => window.clearInterval(id);
  }, [cooldownUntil]);

  const cooldownRemaining = React.useCallback(
    (action: N8nActionKey | "sync") => {
      const until = cooldownUntil[action];
      if (!until) return 0;
      return Math.max(0, Math.ceil((until - Date.now()) / 1000));
    },
    [cooldownUntil]
  );

  const run = React.useCallback(
    async (action: N8nActionKey | "sync") => {
      const label = ACTION_LABELS[action] ?? action;

      // Never fire (or surface a technical error) for an action with no webhook configured.
      if (action !== "sync" && configured && configured[action] === false) {
        toast(`${label} is not connected to n8n yet.`, "error");
        return;
      }
      // Guard against double-submits: one action at a time, plus a post-success cooldown.
      // Both checks read refs so they are effective within a single tick.
      if (inFlightRef.current !== null) return;
      if ((cooldownRef.current[action] ?? 0) > Date.now()) return;

      inFlightRef.current = action;
      setPendingAction(action);
      try {
        const result = action === "sync" ? await syncCrmAction() : await triggerN8nAction(action);
        toast(result.message, result.success ? "success" : "error");

        if (result.success) {
          if (action !== "sync") {
            const until = Date.now() + COOLDOWN_MS;
            cooldownRef.current = { ...cooldownRef.current, [action]: until };
            setCooldownUntil((prev) => ({ ...prev, [action]: until }));
            setLastRunResult({ action, label, triggeredAt: new Date().toISOString() });
          }
          router.refresh();
        }
      } finally {
        inFlightRef.current = null;
        setPendingAction(null);
      }
    },
    [configured, router, toast]
  );

  return { run, pendingAction, cooldownRemaining, lastRunResult, clearLastRunResult: () => setLastRunResult(null) };
}

const STATUS_POLL_MS = 30_000;

/** Polls the optional n8n status workflow while the page is visible, plus a manual refresh. */
export function useAutomationStatus(initial: AutomationStatusResult) {
  const [result, setResult] = React.useState<AutomationStatusResult>(initial);
  const [refreshing, setRefreshing] = React.useState(false);

  const refresh = React.useCallback(async () => {
    if (!initial.configured) return;
    setRefreshing(true);
    setResult(await getAutomationStatusAction());
    setRefreshing(false);
  }, [initial.configured]);

  React.useEffect(() => {
    if (!initial.configured) return;
    let cancelled = false;

    async function poll() {
      if (document.visibilityState !== "visible") return;
      const next = await getAutomationStatusAction();
      if (!cancelled) setResult(next);
    }

    const interval = window.setInterval(poll, STATUS_POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [initial.configured]);

  return { result, refresh, refreshing };
}
