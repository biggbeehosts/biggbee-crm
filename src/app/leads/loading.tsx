import { Skeleton, TableSkeleton } from "@/components/ui/skeleton";

export default function LeadsLoading() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-7 w-32" />
      <TableSkeleton rows={10} cols={8} />
    </div>
  );
}
