"use client";

import type { DemoRecord } from "@/types";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { resolveDownloadUrl } from "@/lib/utils/cloudinary";

export function VideoPlayerModal({ demo, open, onOpenChange }: { demo: DemoRecord | null; open: boolean; onOpenChange: (v: boolean) => void }) {
  const downloadUrl = demo ? resolveDownloadUrl(demo.publicWatchUrl, demo.publicDownloadUrl) : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        {demo && (
          <>
            <DialogHeader>
              <DialogTitle className="capitalize">{demo.demoType} demo</DialogTitle>
              <DialogDescription>{demo.fileName}</DialogDescription>
            </DialogHeader>
            <div className="overflow-hidden rounded-xl bg-black">
              {/* key forces a fresh <video> element when switching demos so the old source doesn't linger */}
              <video key={demo.publicWatchUrl} src={demo.publicWatchUrl} controls autoPlay className="aspect-video w-full" poster={demo.thumbnailUrl || undefined}>
                Your browser does not support embedded video playback.
              </video>
            </div>
            {downloadUrl && (
              <div className="mt-4 flex justify-end">
                <Button size="sm" variant="secondary" asChild>
                  <a href={downloadUrl} target="_blank" rel="noopener noreferrer">
                    <Download className="h-3.5 w-3.5" /> Download MP4
                  </a>
                </Button>
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
