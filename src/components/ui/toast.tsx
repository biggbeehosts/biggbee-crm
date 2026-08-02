"use client";

import * as React from "react";
import { CheckCircle2, XCircle, X } from "lucide-react";
import { cn } from "@/lib/utils/cn";

interface ToastItem {
  id: string;
  message: string;
  variant: "success" | "error";
}

interface ToastContextValue {
  toast: (message: string, variant?: ToastItem["variant"]) => void;
}

const ToastContext = React.createContext<ToastContextValue | null>(null);

const AUTO_DISMISS_MS = 5000;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<ToastItem[]>([]);

  const dismiss = React.useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = React.useCallback(
    (message: string, variant: ToastItem["variant"] = "success") => {
      const id = crypto.randomUUID();
      setToasts((prev) => [...prev.slice(-3), { id, message, variant }]);
      window.setTimeout(() => dismiss(id), AUTO_DISMISS_MS);
    },
    [dismiss]
  );

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-full max-w-sm flex-col gap-2" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cn(
              "pointer-events-auto flex items-start gap-2.5 rounded-xl border bg-surface-raised p-3.5 shadow-xl shadow-black/30 animate-in fade-in slide-in-from-bottom-2",
              t.variant === "success" ? "border-success/30" : "border-danger/30"
            )}
          >
            {t.variant === "success" ? (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
            ) : (
              <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
            )}
            <p className="flex-1 text-xs leading-relaxed text-text-primary">{t.message}</p>
            <button onClick={() => dismiss(t.id)} className="shrink-0 rounded p-0.5 text-text-tertiary hover:text-text-primary" aria-label="Dismiss">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = React.useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
