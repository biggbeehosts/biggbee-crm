"use client";

import * as React from "react";
import type { DemoRecord } from "@/types";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { DemoCard } from "./demo-card";
import { VideoPlayerModal } from "./video-player-modal";
import { Clapperboard, LayoutGrid, List, Search } from "lucide-react";

export function DemoLibraryView({ demos }: { demos: DemoRecord[] }) {
  const [search, setSearch] = React.useState("");
  const [serviceFilter, setServiceFilter] = React.useState("all");
  const [layout, setLayout] = React.useState<"grid" | "list">("grid");
  const [playing, setPlaying] = React.useState<DemoRecord | null>(null);

  const services = React.useMemo(() => {
    const set = new Set(demos.map((d) => d.demoType).filter(Boolean));
    return Array.from(set).sort();
  }, [demos]);

  const filtered = demos.filter((d) => {
    if (serviceFilter !== "all" && d.demoType !== serviceFilter) return false;
    if (search && !`${d.demoType} ${d.fileName}`.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-tertiary" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search demos…" className="pl-8" />
        </div>
        <Select value={serviceFilter} onChange={(e) => setServiceFilter(e.target.value)} className="w-44 capitalize">
          <option value="all">All services</option>
          {services.map((s) => (
            <option key={s} value={s} className="capitalize">
              {s}
            </option>
          ))}
        </Select>
        <div className="ml-auto flex items-center rounded-lg border border-border-subtle p-0.5">
          <Button variant={layout === "grid" ? "secondary" : "ghost"} size="icon" className="h-7 w-7" onClick={() => setLayout("grid")} aria-label="Grid view">
            <LayoutGrid className="h-3.5 w-3.5" />
          </Button>
          <Button variant={layout === "list" ? "secondary" : "ghost"} size="icon" className="h-7 w-7" onClick={() => setLayout("list")} aria-label="List view">
            <List className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={Clapperboard}
          title="No demos found"
          description="Demos added to the Demo_Library sheet appear here automatically."
        />
      ) : layout === "grid" ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((demo, i) => (
            <DemoCard key={`${demo.demoType}-${i}`} demo={demo} onPlay={setPlaying} layout="grid" />
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((demo, i) => (
            <DemoCard key={`${demo.demoType}-${i}`} demo={demo} onPlay={setPlaying} layout="list" />
          ))}
        </div>
      )}

      <VideoPlayerModal demo={playing} open={!!playing} onOpenChange={(v) => !v && setPlaying(null)} />
    </div>
  );
}
