import Link from "next/link";
import { Compass } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-panel text-text-tertiary">
        <Compass className="h-6 w-6" />
      </div>
      <p className="text-sm font-semibold text-text-primary">Page not found</p>
      <p className="max-w-sm text-xs text-text-tertiary">The page you&apos;re looking for doesn&apos;t exist or may have moved.</p>
      <Button asChild size="sm" className="mt-2">
        <Link href="/dashboard">Back to Dashboard</Link>
      </Button>
    </div>
  );
}
