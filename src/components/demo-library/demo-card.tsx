"use client";

import * as React from "react";
import { Play, Download, Link2, Check, ImageOff, TriangleAlert, Clock } from "lucide-react";
import type { DemoRecord } from "@/types";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { checkDemoUrlHealth, resolveDownloadUrl } from "@/lib/utils/cloudinary";

export function DemoCard({ demo, onPlay, layout }: { demo: DemoRecord; onPlay: (demo: DemoRecord) => void; layout: "grid" | "list" }) {
  const [copied, setCopied] = React.useState<string | null>(null);
  const watchHealth = checkDemoUrlHealth(demo.publicWatchUrl);
  const downloadUrl = resolveDownloadUrl(demo.publicWatchUrl, demo.publicDownloadUrl);
  const canPlay = watchHealth === "ok";

  async function copyLink(url: string, key: string) {
    await navigator.clipboard.writeText(url);
    setCopied(key);
    setTimeout(() => setCopied(null), 1500);
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
        <img src={demo.thumbnailUrl} alt="" className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-text-tertiary">
          <ImageOff className="h-6 w-6" />
        </div>
      )}
      {canPlay && (
        <span className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 transition-opacity group-hover:opacity-100">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-accent text-white shadow-lg">
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
        <p className="text-sm font-semibold capitalize text-text-primary">{demo.demoType || "Untitled demo"}</p>
        {watchHealth === "missing" && <Badge variant="warning"><TriangleAlert className="h-3 w-3" /> No URL</Badge>}
        {watchHealth === "invalid" && <Badge variant="danger"><TriangleAlert className="h-3 w-3" /> Invalid URL</Badge>}
        {watchHealth === "ok" && !demo.thumbnailUrl && <Badge variant="warning">No thumbnail</Badge>}
        {watchHealth === "ok" && demo.thumbnailUrl && <Badge variant="success">Healthy</Badge>}
      </div>
      <p className="mt-0.5 truncate text-xs text-text-tertiary">{demo.fileName || "No file name on record"}</p>

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
            {copied === "watch" ? "Copied" : "Copy watch URL"}
          </Button>
        )}
      </div>
    </div>
  );

  if (layout === "list") {
    return (
      <Card className="flex items-center gap-4 p-3">
        {thumbnail}
        {body}
      </Card>
    );
  }

  return <Card className="overflow-hidden">{thumbnail}{body}</Card>;
}
