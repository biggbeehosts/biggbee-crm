"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-danger/10 text-danger">
        <AlertTriangle className="h-6 w-6" />
      </div>
      <p className="text-sm font-semibold text-text-primary">Something went wrong loading this page</p>
      <p className="max-w-sm text-xs text-text-tertiary">{error.message || "An unexpected error occurred."}</p>
      <Button size="sm" onClick={reset} className="mt-2">
        Try again
      </Button>
    </div>
  );
}
