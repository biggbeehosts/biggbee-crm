"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/utils/date";
import { refreshDataAction } from "@/lib/actions/leads";

export function DashboardControls({ lastSyncedAt }: { lastSyncedAt: string | null }) {
  const router = useRouter();
  const [refreshing, setRefreshing] = React.useState(false);

  async function handleRefresh() {
    setRefreshing(true);
    await refreshDataAction();
    router.refresh();
    setTimeout(() => setRefreshing(false), 500);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="hidden items-center gap-1.5 text-xs text-text-tertiary sm:flex">
        <Clock className="h-3.5 w-3.5" />
        Synced {lastSyncedAt ? formatDateTime(lastSyncedAt) : "just now"}
      </div>
      <Button variant="secondary" size="sm" onClick={handleRefresh}>
        <RefreshCw className={refreshing ? "h-3.5 w-3.5 animate-spin" : "h-3.5 w-3.5"} />
        Refresh
      </Button>
    </div>
  );
}
