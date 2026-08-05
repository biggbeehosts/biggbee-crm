"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { UploadCloud, Film, X, TriangleAlert } from "lucide-react";
import type { DemoRecord } from "@/types";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/components/ui/toast";
import { createDemoUploadSignatureAction, registerDemoUploadAction } from "@/lib/actions/demo-uploads";

/** Cloudinary's own upload response shape, narrowed to the fields this pipeline uses. */
interface CloudinaryUploadResponse {
  secure_url: string;
  public_id: string;
  bytes: number;
  duration?: number;
  format?: string;
}

function uploadWithProgress(url: string, formData: FormData, onProgress: (pct: number) => void): Promise<CloudinaryUploadResponse> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText) as CloudinaryUploadResponse);
        } catch {
          reject(new Error("Cloudinary returned an unreadable response."));
        }
      } else {
        try {
          const body = JSON.parse(xhr.responseText) as { error?: { message?: string } };
          reject(new Error(body.error?.message || `Cloudinary upload failed (HTTP ${xhr.status}).`));
        } catch {
          reject(new Error(`Cloudinary upload failed (HTTP ${xhr.status}).`));
        }
      }
    };
    xhr.onerror = () => reject(new Error("Network error while uploading to Cloudinary."));
    xhr.send(formData);
  });
}

export function DemoUploadDialog({
  storageConfigured,
  storageWarning,
  services,
  industries,
  languages,
  replacesDemo,
  trigger,
}: {
  storageConfigured: boolean;
  storageWarning?: string;
  services: string[];
  industries: string[];
  languages: string[];
  /** When set, this upload replaces an existing demo's video (Stage 6 versioning) -- the old row
   *  is archived, a new one created with version+1, form fields pre-filled from it. */
  replacesDemo?: DemoRecord;
  trigger?: React.ReactNode;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = React.useState(false);
  const [file, setFile] = React.useState<File | null>(null);
  const [dragOver, setDragOver] = React.useState(false);
  const [progress, setProgress] = React.useState(0);
  const [stage, setStage] = React.useState<"idle" | "uploading" | "registering">("idle");
  const [error, setError] = React.useState<string | null>(null);
  const previewUrl = React.useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);

  const [name, setName] = React.useState(replacesDemo?.name ?? "");
  const [service, setService] = React.useState(replacesDemo?.service ?? "");
  const [industry, setIndustry] = React.useState(replacesDemo?.industry ?? "");
  const [language, setLanguage] = React.useState(replacesDemo?.language ?? "");
  const [priority, setPriority] = React.useState(replacesDemo?.priority ?? 0);
  const [active, setActive] = React.useState(replacesDemo?.active ?? true);
  const [isFallback, setIsFallback] = React.useState(replacesDemo?.isFallback ?? false);

  React.useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  function pickFile(f: File | undefined | null) {
    if (!f) return;
    if (!f.type.startsWith("video/")) {
      setError("Only video files can be uploaded to the Demo Library.");
      return;
    }
    setError(null);
    setFile(f);
  }

  function reset() {
    setFile(null);
    setProgress(0);
    setStage("idle");
    setError(null);
  }

  async function handleUpload() {
    if (!file) {
      setError("Choose or drop a video file first.");
      return;
    }
    setError(null);
    setStage("uploading");
    setProgress(0);

    const signatureResult = await createDemoUploadSignatureAction(file.name, file.type);
    if (!signatureResult.configured || !signatureResult.signature || !signatureResult.demoId) {
      setError(signatureResult.message || "Cloudinary is not configured.");
      setStage("idle");
      return;
    }

    try {
      const formData = new FormData();
      formData.append("file", file);
      for (const [key, value] of Object.entries(signatureResult.signature.fields)) formData.append(key, value);

      const uploaded = await uploadWithProgress(signatureResult.signature.uploadUrl, formData, setProgress);

      setStage("registering");
      const result = await registerDemoUploadAction({
        demoId: signatureResult.demoId,
        secureUrl: uploaded.secure_url,
        publicId: uploaded.public_id,
        bytes: uploaded.bytes,
        durationSeconds: uploaded.duration,
        format: uploaded.format,
        fileName: file.name,
        name: name || undefined,
        service: service || undefined,
        industry: industry || undefined,
        language: language || undefined,
        priority,
        active,
        isFallback,
        replacesDemoId: replacesDemo?.demoId,
      });

      if (!result.success) {
        setError(result.message);
        setStage("idle");
        return;
      }

      toast(result.message, "success");
      setOpen(false);
      reset();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
      setStage("idle");
    }
  }

  const busy = stage !== "idle";

  return (
    <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (!next) reset(); }}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm" disabled={!storageConfigured} title={!storageConfigured ? storageWarning : undefined}>
            <UploadCloud className="h-3.5 w-3.5" /> Upload Demo
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{replacesDemo ? `Replace video for ${replacesDemo.name || replacesDemo.demoId}` : "Upload Demo"}</DialogTitle>
          <DialogDescription>
            {replacesDemo
              ? "The current version stays intact and archived -- leads that already reference it are unaffected. This creates a new version."
              : "Uploads directly to Cloudinary, generates a thumbnail automatically, and is available to email automation immediately -- no Sheet editing needed."}
          </DialogDescription>
        </DialogHeader>

        {!storageConfigured ? (
          <div className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 p-3 text-xs text-warning">
            <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{storageWarning || "Cloudinary is not configured -- uploads are disabled until CLOUDINARY_CLOUD_NAME/API_KEY/API_SECRET are set."}</span>
          </div>
        ) : (
          <div className="space-y-3">
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => { e.preventDefault(); setDragOver(false); pickFile(e.dataTransfer.files?.[0]); }}
              className={`flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-6 text-center transition-colors ${dragOver ? "border-accent bg-accent-soft" : "border-border-subtle"}`}
            >
              {previewUrl ? (
                <div className="relative w-full">
                  {/* eslint-disable-next-line jsx-a11y/media-has-caption -- local preview, no captions available */}
                  <video src={previewUrl} controls className="max-h-48 w-full rounded-lg bg-black" />
                  <button
                    type="button"
                    onClick={() => setFile(null)}
                    className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-surface-raised text-text-secondary shadow hover:text-danger"
                    aria-label="Remove file"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                  <p className="mt-1.5 truncate text-xs text-text-tertiary">{file?.name} · {file ? Math.round(file.size / 1024 / 1024) : 0} MB</p>
                </div>
              ) : (
                <>
                  <Film className="h-6 w-6 text-text-tertiary" />
                  <p className="text-xs text-text-secondary">Drag & drop a video, or</p>
                  <label className="cursor-pointer text-xs font-medium text-accent-strong hover:underline">
                    browse files
                    <input type="file" accept="video/*" className="hidden" onChange={(e) => pickFile(e.target.files?.[0])} />
                  </label>
                </>
              )}
            </div>

            {stage !== "idle" && (
              <div className="space-y-1">
                <Progress value={stage === "registering" ? 100 : progress} />
                <p className="text-[11px] text-text-tertiary">{stage === "uploading" ? `Uploading to Cloudinary… ${progress}%` : "Generating thumbnail and registering demo…"}</p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              <Input placeholder="Demo name" value={name} onChange={(e) => setName(e.target.value)} disabled={busy} className="col-span-2" />
              <Select value={service} onChange={(e) => setService(e.target.value)} disabled={busy}>
                <option value="">Service…</option>
                {services.map((s) => <option key={s} value={s}>{s}</option>)}
              </Select>
              <Select value={industry} onChange={(e) => setIndustry(e.target.value)} disabled={busy}>
                <option value="">Industry…</option>
                {industries.map((s) => <option key={s} value={s}>{s}</option>)}
              </Select>
              <Select value={language} onChange={(e) => setLanguage(e.target.value)} disabled={busy}>
                <option value="">Language…</option>
                {languages.map((s) => <option key={s} value={s}>{s}</option>)}
              </Select>
              <Input
                type="number"
                min={0}
                placeholder="Priority"
                value={priority}
                onChange={(e) => setPriority(Number(e.target.value) || 0)}
                disabled={busy}
              />
            </div>

            <div className="flex items-center justify-between rounded-lg border border-border-subtle px-3 py-2">
              <span className="text-xs text-text-secondary">Active</span>
              <Switch checked={active} onCheckedChange={setActive} disabled={busy} />
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border-subtle px-3 py-2">
              <div>
                <span className="block text-xs text-text-secondary">Fallback demo</span>
                <span className="block text-[10px] text-text-tertiary">Used as a last resort when no campaign matches Service/Industry/Language</span>
              </div>
              <Switch checked={isFallback} onCheckedChange={setIsFallback} disabled={busy} />
            </div>
          </div>
        )}

        {error && <p className="text-xs text-danger">{error}</p>}

        <DialogFooter>
          <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(false)} disabled={busy}>
            Cancel
          </Button>
          <Button type="button" size="sm" onClick={handleUpload} disabled={!storageConfigured || !file || busy}>
            {busy ? "Uploading…" : "Upload"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
