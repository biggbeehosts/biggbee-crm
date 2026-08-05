"use client";

import * as React from "react";
import { CloudCog, CheckCircle2, XCircle, HardDrive, Upload, TriangleAlert } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getStorageHealthAction, type StorageHealthResult } from "@/lib/actions/demo-uploads";
import { formatDateTime } from "@/lib/utils/date";

function formatBytes(bytes: number | null): string {
  if (bytes === null) return "—";
  const mb = bytes / 1024 / 1024;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  return `${(mb / 1024).toFixed(2)} GB`;
}

/** Client-fetched (not server-rendered) so the connectivity ping and usage numbers reflect "right
 *  now," not the last page load -- a stale "Connected" badge would be worse than a brief loading
 *  state (Stage 6, Part 6). */
export function StorageHealthCard() {
  const [data, setData] = React.useState<StorageHealthResult | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    getStorageHealthAction().then((res) => {
      if (!cancelled) {
        setData(res);
        setLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, []);

  if (loading || !data) {
    return (
      <Card className="p-4">
        <p className="text-xs text-text-tertiary">Checking storage connection…</p>
      </Card>
    );
  }

  const { health, uploadLog } = data;

  return (
    <Card className="space-y-3 p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CloudCog className="h-4 w-4 text-text-tertiary" />
          <p className="text-sm font-semibold text-text-primary">Storage Health — {health.provider}</p>
        </div>
        {!health.configured ? (
          <Badge variant="warning"><TriangleAlert className="h-3 w-3" /> Not configured</Badge>
        ) : health.connected ? (
          <Badge variant="success"><CheckCircle2 className="h-3 w-3" /> Connected</Badge>
        ) : (
          <Badge variant="danger"><XCircle className="h-3 w-3" /> Unreachable</Badge>
        )}
      </div>

      {!health.configured && (
        <p className="text-xs text-text-tertiary">
          Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET to enable uploads.
        </p>
      )}
      {health.error && <p className="text-xs text-danger">{health.error}</p>}

      <div className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
        <div>
          <p className="flex items-center gap-1 text-text-tertiary"><HardDrive className="h-3 w-3" /> Storage used</p>
          <p className="mt-0.5 font-medium text-text-primary">{formatBytes(health.usage?.storageBytes ?? null)}</p>
        </div>
        <div>
          <p className="flex items-center gap-1 text-text-tertiary"><Upload className="h-3 w-3" /> Uploads today</p>
          <p className="mt-0.5 font-medium text-text-primary">{uploadLog.uploadsToday}</p>
        </div>
        <div>
          <p className="text-text-tertiary">Last upload</p>
          <p className="mt-0.5 font-medium text-text-primary">{uploadLog.lastUpload ? formatDateTime(uploadLog.lastUpload.at) : "—"}</p>
        </div>
        <div>
          <p className="text-text-tertiary">Last failure</p>
          <p className="mt-0.5 font-medium text-text-primary">{uploadLog.lastFailure ? formatDateTime(uploadLog.lastFailure.at) : "None"}</p>
        </div>
      </div>
    </Card>
  );
}
