"use client";

import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import type { Campaign, Lead } from "@/types";
import { Checkbox } from "@/components/ui/checkbox";
import { StatusBadge, ConfidenceBadge } from "@/components/ui/status-badge";
import { formatDate } from "@/lib/utils/date";
import { initials } from "@/lib/utils/format";

/** Columns depend on the current campaigns list only to resolve a lead's Campaign ID to a
 *  display name -- the id itself, never the name, is what's persisted (see Lead.campaignId). */
export function buildLeadsColumns(campaigns: Campaign[]): ColumnDef<Lead>[] {
  const campaignName = (id?: string) => (id ? (campaigns.find((c) => c.id === id)?.name ?? id) : undefined);

  return [
  {
    id: "select",
    header: ({ table }) => (
      <Checkbox
        checked={table.getIsAllPageRowsSelected() ? true : table.getIsSomePageRowsSelected() ? "indeterminate" : false}
        onCheckedChange={(v) => table.toggleAllPageRowsSelected(!!v)}
        onClick={(e) => e.stopPropagation()}
        aria-label="Select all"
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        checked={row.getIsSelected()}
        onCheckedChange={(v) => row.toggleSelected(!!v)}
        onClick={(e) => e.stopPropagation()}
        aria-label="Select row"
      />
    ),
    enableSorting: false,
    enableHiding: false,
    size: 32,
  },
  {
    accessorKey: "company",
    header: "Company",
    cell: ({ row }) => (
      <Link
        href={`/leads/${encodeURIComponent(row.original.email)}`}
        onClick={(e) => e.stopPropagation()}
        className="font-medium text-text-primary hover:text-accent"
      >
        {row.original.company}
      </Link>
    ),
  },
  {
    accessorKey: "name",
    header: "Contact",
    cell: ({ row }) => (
      <div className="flex items-center gap-2">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-panel text-[10px] font-semibold text-text-secondary">
          {initials(row.original.name)}
        </span>
        <span className="text-text-secondary">{row.original.name}</span>
      </div>
    ),
  },
  {
    accessorKey: "email",
    header: "Email",
    cell: ({ row }) => <span className="text-text-tertiary">{row.original.email}</span>,
  },
  {
    accessorKey: "campaignId",
    header: "Campaign",
    cell: ({ row }) => campaignName(row.original.campaignId) || <span className="text-text-tertiary">Unassigned</span>,
  },
  { accessorKey: "industry", header: "Industry", cell: ({ row }) => row.original.industry || "—" },
  { accessorKey: "businessType", header: "Business Type", cell: ({ row }) => row.original.businessType || "—" },
  { accessorKey: "leadGenerationType", header: "Lead Gen Type", cell: ({ row }) => row.original.leadGenerationType || "—" },
  { accessorKey: "country", header: "Country", cell: ({ row }) => row.original.country || "—" },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => <StatusBadge status={row.original.status} />,
  },
  { accessorKey: "serviceOffered", header: "Service Offered", cell: ({ row }) => row.original.serviceOffered || "—" },
  {
    accessorKey: "confidence",
    header: "Confidence",
    cell: ({ row }) => <ConfidenceBadge value={row.original.confidence} />,
    sortingFn: (a, b) => (a.original.confidence ?? -1) - (b.original.confidence ?? -1),
  },
  { accessorKey: "demoType", header: "Demo Type", cell: ({ row }) => row.original.demoType || "—" },
  {
    accessorKey: "lastContact",
    header: "Last Contact",
    cell: ({ row }) => formatDate(row.original.lastContact),
  },
  {
    accessorKey: "followUpCount",
    header: "Follow-ups",
    cell: ({ row }) => row.original.followUpCount,
  },
  ];
}
