"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Play, Download, Link2, Check, ImageOff, TriangleAlert, Clock, Hash, Users, Archive, Upload as UploadIcon, History } from "lucide-react";
import type { DemoRecord } from "@/types";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/toast";
import { checkDemoUrlHealth, computeDemoValidationStatus, resolveDownloadUrl } from "@/lib/utils/cloudinary";
import { archiveDemoAction, updateDemoMetadataAction } from "@/lib/actions/demo-uploads";
import { DemoUploadDialog } from "./demo-upload-dialog";

const VALIDATION_META: Record<ReturnType<typeof computeDemoValidationStatus>, { label: string; variant: "success" | "warning" | "danger" }> = {
  healthy: { label: "Healthy", variant: "success" },
  "missing-url": { label: "Missing URL", variant: "warning" },
  "missing-file": { label: "Missing file", variant: "warning" },
  inactive: { label: "Inactive", variant: "warning" },
  "invalid-mapping": { label: "Invalid mapping", variant: "danger" },
};

export function DemoCard({
  demo,
  usageCount,
  onPlay,
  layout,
  storageConfigured,
  services,
  industries,
  languages,
}: {
  demo: DemoRecord;
  usageCount: number;
  onPlay: (demo: DemoRecord) => void;
  layout: "grid" | "list";
  storageConfigured: boolean;
  services: string[];
  industries: string[];
  languages: string[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [copied, setCopied] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const watchHealth = checkDemoUrlHealth(demo.publicWatchUrl);
  const downloadUrl = resolveDownloadUrl(demo.publicWatchUrl, demo.publicDownloadUrl);
  const canPlay = watchHealth === "ok";
  const validation = VALIDATION_META[computeDemoValidationStatus(demo)];

  async function copyLink(url: string, key: string) {
    await navigator.clipboard.writeText(url);
    setCopied(key);
    setTimeout(() => setCopied(null), 1500);
  }

  async function toggleActive(next: boolean) {
    setBusy(true);
    const result = await updateDemoMetadataAction(demo.demoId, { active: next });
    setBusy(false);
    if (!result.success) toast(result.message, "error");
    else router.refresh();
  }

  async function handleArchive() {
    setBusy(true);
    const result = await archiveDemoAction(demo.demoId);
    setBusy(false);
    toast(result.message, result.success ? "success" : "error");
    if (result.success) router.refresh();
  }

  const thumbnail = (
    <button
      onClick={() => canPlay && onPlay(demo)}
      disabled={!canPlay}
      className={`group relative overflow-hidden bg-panel ${layout === "grid" ? "aspect-video w-full rounded-t-2xl" : "h-24 w-40 shrink-0 rounded-xl"} ${canPlay ? "cursor-pointer" : "cursor-not-allowed"}`}
      aria-label={canPlay ? `Play ${demo.demoType} demo` : "Demo unavailable"}
    >
      {demo.thumbnailUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- external Cloudinary thumbnails, dimensions unknown
        <img src={demo.thumbnailUrl} alt="" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-surface-2 text-text-tertiary">
          <ImageOff className="h-6 w-6" />
        </div>
      )}
      {/* Permanent bottom gradient (not hover-only) so the duration chip always sits on a
          readable surface -- reads as a real media-asset browser rather than a plain image. */}
      <span className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-black/60 to-transparent" />
      {canPlay && (
        <span className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 transition-opacity group-hover:opacity-100">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-accent text-white shadow-lg shadow-accent/30">
            <Play className="ml-0.5 h-4 w-4" />
          </span>
        </span>
      )}
      {demo.duration && (
        <span className="absolute bottom-1.5 right-1.5 flex items-center gap-1 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-medium text-white">
          <Clock className="h-2.5 w-2.5" />
          {demo.duration}
        </span>
      )}
    </button>
  );

  const body = (
    <div className={layout === "grid" ? "p-4" : "min-w-0 flex-1 py-1"}>
      <div className="flex flex-wrap items-center gap-1.5">
        <p className="truncate text-sm font-semibold text-text-primary">{demo.name || demo.demoType || "Untitled demo"}</p>
        <Badge variant={validation.variant}>
          {validation.variant !== "success" && <TriangleAlert className="h-3 w-3" />} {validation.label}
        </Badge>
      </div>
      <p className="mt-0.5 truncate text-xs capitalize text-text-tertiary">
        {demo.demoType || "—"}
        {demo.service ? ` · ${demo.service}` : ""}
      </p>

      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        {demo.demoId && (
          <button
            onClick={() => copyLink(demo.demoId, "id")}
            className="flex items-center gap-1 rounded-md border border-border-subtle px-1.5 py-0.5 text-[10px] font-mono text-text-tertiary transition-colors hover:border-border-strong hover:text-text-secondary"
            title="Copy Demo ID"
          >
            <Hash className="h-2.5 w-2.5" />
            {copied === "id" ? "Copied" : demo.demoId}
          </button>
        )}
        <Badge variant="outline">
          <Users className="h-2.5 w-2.5" /> {usageCount} campaign{usageCount === 1 ? "" : "s"}
        </Badge>
        <Badge variant={downloadUrl ? "success" : "outline"}>{downloadUrl ? "Attachment available" : "No attachment"}</Badge>
        {demo.language && <Badge variant="outline">{demo.language}</Badge>}
        {demo.isFallback && <Badge variant="outline">Fallback</Badge>}
        {demo.version > 1 && (
          <Badge variant="outline">
            <History className="h-2.5 w-2.5" /> v{demo.version}
          </Badge>
        )}
        {demo.archived && <Badge variant="warning">Archived</Badge>}
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        <Button size="sm" variant="secondary" disabled={!canPlay} onClick={() => onPlay(demo)}>
          <Play className="h-3.5 w-3.5" /> Watch
        </Button>
        <Button size="sm" variant="secondary" disabled={!downloadUrl} asChild={!!downloadUrl}>
          {downloadUrl ? (
            <a href={downloadUrl} target="_blank" rel="noopener noreferrer">
              <Download className="h-3.5 w-3.5" /> Download
            </a>
          ) : (
            <span>
              <Download className="h-3.5 w-3.5" /> Download
            </span>
          )}
        </Button>
        {canPlay && (
          <Button size="sm" variant="ghost" onClick={() => copyLink(demo.publicWatchUrl!, "watch")}>
            {copied === "watch" ? <Check className="h-3.5 w-3.5" /> : <Link2 className="h-3.5 w-3.5" />}
            {copied === "watch" ? "Copied" : "Copy URL"}
          </Button>
        )}
      </div>

      {!demo.archived && (
        <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-border-subtle pt-3">
          <label className="flex items-center gap-1.5 text-xs text-text-secondary">
            <Switch checked={demo.active} onCheckedChange={toggleActive} disabled={busy} />
            Active
          </label>
          <DemoUploadDialog
            storageConfigured={storageConfigured}
            services={services}
            industries={industries}
            languages={languages}
            replacesDemo={demo}
            trigger={
              <Button size="sm" variant="ghost" disabled={busy}>
                <UploadIcon className="h-3.5 w-3.5" /> Replace video
              </Button>
            }
          />
          <Button size="sm" variant="ghost" className="ml-auto text-danger hover:text-danger" onClick={handleArchive} disabled={busy}>
            <Archive className="h-3.5 w-3.5" /> Archive
          </Button>
        </div>
      )}
    </div>
  );

  if (layout === "list") {
    return (
      <Card level={2} className="flex items-center gap-4 p-3">
        {thumbnail}
        {body}
      </Card>
    );
  }

  return (
    <Card level={2} className="overflow-hidden">
      {thumbnail}
      {body}
    </Card>
  );
}
