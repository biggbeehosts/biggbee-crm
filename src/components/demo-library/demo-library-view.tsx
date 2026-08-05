"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { DemoRecord } from "@/types";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { DemoCard } from "./demo-card";
import { VideoPlayerModal } from "./video-player-modal";
import { DemoUploadDialog } from "./demo-upload-dialog";
import { StorageHealthCard } from "./storage-health-card";
import { refreshDemoLibraryAction, type DemoLibraryRefreshResult } from "@/lib/actions/demo-library";
import { Clapperboard, LayoutGrid, List, RefreshCw, Search } from "lucide-react";

export function DemoLibraryView({
  demos,
  usageCounts,
  storageConfigured,
}: {
  demos: DemoRecord[];
  usageCounts: Record<string, number>;
  storageConfigured: boolean;
}) {
  const router = useRouter();
  const [search, setSearch] = React.useState("");
  const [serviceFilter, setServiceFilter] = React.useState("all");
  const [demoTypeFilter, setDemoTypeFilter] = React.useState("all");
  const [industryFilter, setIndustryFilter] = React.useState("all");
  const [statusFilter, setStatusFilter] = React.useState<"all" | "active" | "inactive">("all");
  const [layout, setLayout] = React.useState<"grid" | "list">("grid");
  const [playing, setPlaying] = React.useState<DemoRecord | null>(null);
  const [refreshing, setRefreshing] = React.useState(false);
  const [refreshResult, setRefreshResult] = React.useState<DemoLibraryRefreshResult | null>(null);

  const services = React.useMemo(() => uniqueSorted(demos.map((d) => d.service)), [demos]);
  const demoTypes = React.useMemo(() => uniqueSorted(demos.map((d) => d.demoType)), [demos]);
  const industries = React.useMemo(() => uniqueSorted(demos.map((d) => d.industry)), [demos]);
  const languages = React.useMemo(() => uniqueSorted(demos.map((d) => d.language)), [demos]);

  const filtered = demos.filter((d) => {
    if (serviceFilter !== "all" && d.service !== serviceFilter) return false;
    if (demoTypeFilter !== "all" && d.demoType !== demoTypeFilter) return false;
    if (industryFilter !== "all" && d.industry !== industryFilter) return false;
    if (statusFilter === "active" && !d.active) return false;
    if (statusFilter === "inactive" && d.active) return false;
    if (search && !`${d.demoId} ${d.name} ${d.demoType} ${d.fileName}`.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  async function handleRefresh() {
    setRefreshing(true);
    try {
      const result = await refreshDemoLibraryAction();
      setRefreshResult(result);
      router.refresh();
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-tertiary" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search demos, Demo ID…" className="pl-8" />
        </div>
        <Select value={serviceFilter} onChange={(e) => setServiceFilter(e.target.value)} className="w-40">
          <option value="all">All services</option>
          {services.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </Select>
        <Select value={demoTypeFilter} onChange={(e) => setDemoTypeFilter(e.target.value)} className="w-40 capitalize">
          <option value="all">All demo types</option>
          {demoTypes.map((s) => (
            <option key={s} value={s} className="capitalize">
              {s}
            </option>
          ))}
        </Select>
        <Select value={industryFilter} onChange={(e) => setIndustryFilter(e.target.value)} className="w-36">
          <option value="all">All industries</option>
          {industries.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </Select>
        <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)} className="w-32">
          <option value="all">Active + inactive</option>
          <option value="active">Active only</option>
          <option value="inactive">Inactive only</option>
        </Select>

        <Button variant="secondary" size="sm" onClick={handleRefresh} disabled={refreshing}>
          <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
          {refreshing ? "Refreshing…" : "Refresh"}
        </Button>

        <DemoUploadDialog storageConfigured={storageConfigured} services={services} industries={industries} languages={languages} />

        <div className="ml-auto flex items-center rounded-lg border border-border-subtle p-0.5">
          <Button variant={layout === "grid" ? "secondary" : "ghost"} size="icon" className="h-7 w-7" onClick={() => setLayout("grid")} aria-label="Grid view">
            <LayoutGrid className="h-3.5 w-3.5" />
          </Button>
          <Button variant={layout === "list" ? "secondary" : "ghost"} size="icon" className="h-7 w-7" onClick={() => setLayout("list")} aria-label="List view">
            <List className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <StorageHealthCard />

      {refreshResult && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border-subtle bg-panel px-3 py-2 text-xs text-text-secondary">
          <span className="font-medium text-text-primary">Refreshed {formatTime(refreshResult.refreshedAt)}:</span>
          <span>{refreshResult.total} total</span>
          <span className="text-success">{refreshResult.newCount} new</span>
          <span className="text-accent-strong">{refreshResult.updatedCount} updated</span>
          <span className="text-danger">{refreshResult.invalidCount} invalid</span>
          <span className="text-warning">{refreshResult.inactiveCount} inactive</span>
        </div>
      )}

      {filtered.length === 0 ? (
        <EmptyState
          icon={Clapperboard}
          title="No demos found"
          description="Demos added to the Demo_Library sheet appear here automatically -- try Refresh or widen your filters."
        />
      ) : layout === "grid" ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((demo) => (
            <DemoCard
              key={demo.demoId || `${demo.demoType}-${demo.rowNumber}`}
              demo={demo}
              usageCount={usageCounts[demo.demoId] ?? 0}
              onPlay={setPlaying}
              layout="grid"
              storageConfigured={storageConfigured}
              services={services}
              industries={industries}
              languages={languages}
            />
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((demo) => (
            <DemoCard
              key={demo.demoId || `${demo.demoType}-${demo.rowNumber}`}
              demo={demo}
              usageCount={usageCounts[demo.demoId] ?? 0}
              onPlay={setPlaying}
              layout="list"
              storageConfigured={storageConfigured}
              services={services}
              industries={industries}
              languages={languages}
            />
          ))}
        </div>
      )}

      <VideoPlayerModal demo={playing} open={!!playing} onOpenChange={(v) => !v && setPlaying(null)} />
    </div>
  );
}

function uniqueSorted(values: (string | undefined)[]): string[] {
  const set = new Set(values.map((v) => v?.trim()).filter(Boolean) as string[]);
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString();
  } catch {
    return iso;
  }
}
