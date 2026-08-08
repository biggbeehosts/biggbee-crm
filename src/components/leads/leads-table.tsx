"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  type ColumnFiltersState,
  type SortingState,
  type VisibilityState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { ArrowUpDown, ChevronLeft, ChevronRight, Columns3, Download, FlaskConical, Search, SlidersHorizontal, Trash2, X } from "lucide-react";
import type { Campaign, Lead, LeadStatus } from "@/types";
import { LEAD_STATUSES } from "@/types";
import { buildLeadsColumns } from "./columns";
import { AddLeadDialog, type AddLeadOptions } from "./add-lead-dialog";
import { EditLeadDialog } from "@/components/lead-detail/edit-lead-dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { STATUS_COLORS } from "@/lib/utils/status";
import { downloadCsv, toCsv } from "@/lib/utils/csv";
import { cn } from "@/lib/utils/cn";
import { UsersRound } from "lucide-react";
import { bulkAssignCampaignAction, bulkChangeStatusAction, bulkDeleteLeadsAction, bulkSetTestFlagAction, deleteLeadAction } from "@/lib/actions/leads";
import { useToast } from "@/components/ui/toast";

const CONFIDENCE_RANGES = [
  { value: "all", label: "Any confidence" },
  { value: "high", label: "High (75-100%)" },
  { value: "medium", label: "Medium (45-74%)" },
  { value: "low", label: "Low (0-44%)" },
  { value: "unscored", label: "Unscored" },
];

export function LeadsTable({
  leads,
  initialSearch = "",
  addLeadOptions,
  campaigns = [],
}: {
  leads: Lead[];
  initialSearch?: string;
  addLeadOptions?: AddLeadOptions;
  campaigns?: Campaign[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [editingLead, setEditingLead] = React.useState<Lead | null>(null);
  const [deletingLead, setDeletingLead] = React.useState<Lead | null>(null);
  const [deletingLeadPending, setDeletingLeadPending] = React.useState(false);
  const [globalFilter, setGlobalFilter] = React.useState(initialSearch);
  const [sorting, setSorting] = React.useState<SortingState>([{ id: "lastContact", desc: true }]);
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({});
  const [rowSelection, setRowSelection] = React.useState({});
  const columnFilters: ColumnFiltersState = [];

  const [statusFilter, setStatusFilter] = React.useState<Set<LeadStatus>>(new Set());
  const [industryFilter, setIndustryFilter] = React.useState("all");
  const [countryFilter, setCountryFilter] = React.useState("all");
  const [businessTypeFilter, setBusinessTypeFilter] = React.useState("all");
  const [leadGenTypeFilter, setLeadGenTypeFilter] = React.useState("all");
  const [serviceFilter, setServiceFilter] = React.useState("all");
  const [confidenceFilter, setConfidenceFilter] = React.useState("all");
  const [campaignFilter, setCampaignFilter] = React.useState("all");
  const [dataFilter, setDataFilter] = React.useState<"all" | "production" | "test">("all");

  const industries = React.useMemo(() => uniqueSorted(leads.map((l) => l.industry)), [leads]);
  const countries = React.useMemo(() => uniqueSorted(leads.map((l) => l.country)), [leads]);
  const businessTypes = React.useMemo(() => uniqueSorted(leads.map((l) => l.businessType)), [leads]);
  const leadGenTypes = React.useMemo(() => uniqueSorted(leads.map((l) => l.leadGenerationType)), [leads]);
  const services = React.useMemo(() => uniqueSorted(leads.map((l) => l.serviceOffered)), [leads]);
  const columns = React.useMemo(
    () => buildLeadsColumns(campaigns, { onEdit: setEditingLead, onDelete: setDeletingLead }),
    [campaigns]
  );

  const filtered = React.useMemo(() => {
    return leads.filter((lead) => {
      if (statusFilter.size > 0 && !statusFilter.has(lead.status)) return false;
      if (industryFilter !== "all" && (lead.industry || "—") !== industryFilter) return false;
      if (countryFilter !== "all" && (lead.country || "—") !== countryFilter) return false;
      if (businessTypeFilter !== "all" && (lead.businessType || "—") !== businessTypeFilter) return false;
      if (leadGenTypeFilter !== "all" && (lead.leadGenerationType || "—") !== leadGenTypeFilter) return false;
      if (serviceFilter !== "all" && (lead.serviceOffered || "—") !== serviceFilter) return false;
      if (campaignFilter !== "all" && (lead.campaignId || "unassigned") !== campaignFilter) return false;
      if (dataFilter === "production" && lead.isTest) return false;
      if (dataFilter === "test" && !lead.isTest) return false;

      if (confidenceFilter !== "all") {
        const c = lead.confidence;
        if (confidenceFilter === "unscored" && c !== null) return false;
        if (confidenceFilter === "high" && !(c !== null && c >= 75)) return false;
        if (confidenceFilter === "medium" && !(c !== null && c >= 45 && c < 75)) return false;
        if (confidenceFilter === "low" && !(c !== null && c < 45)) return false;
      }

      return true;
    });
  }, [leads, statusFilter, industryFilter, countryFilter, businessTypeFilter, leadGenTypeFilter, serviceFilter, confidenceFilter, campaignFilter, dataFilter]);

  const testCount = React.useMemo(() => leads.filter((l) => l.isTest).length, [leads]);

  const table = useReactTable({
    data: filtered,
    columns,
    // Stable row identity by email (Lead's real primary key -- see types/lead.ts) instead of
    // TanStack's default array-index id. Without this, rowSelection and the <tr key={row.id}>
    // below both key off position: any reorder/refetch (every bulk/individual action calls
    // router.refresh(), which hands LeadsTable a brand-new `leads` array) silently reassigns
    // selection to the wrong rows and can remount checkboxes, which is what made selection feel
    // unreliable.
    getRowId: (row) => row.email,
    state: { sorting, columnVisibility, rowSelection, columnFilters, globalFilter },
    onSortingChange: setSorting,
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    onGlobalFilterChange: setGlobalFilter,
    globalFilterFn: (row, _columnId, value) => {
      const q = String(value).toLowerCase();
      if (!q) return true;
      const lead = row.original as Lead;
      return [lead.company, lead.name, lead.email, lead.industry, lead.country, lead.serviceOffered]
        .filter(Boolean)
        .some((field) => String(field).toLowerCase().includes(q));
    },
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 15 } },
  });

  const activeFilterCount =
    statusFilter.size +
    (industryFilter !== "all" ? 1 : 0) +
    (countryFilter !== "all" ? 1 : 0) +
    (businessTypeFilter !== "all" ? 1 : 0) +
    (leadGenTypeFilter !== "all" ? 1 : 0) +
    (serviceFilter !== "all" ? 1 : 0) +
    (confidenceFilter !== "all" ? 1 : 0) +
    (campaignFilter !== "all" ? 1 : 0);

  function clearFilters() {
    setStatusFilter(new Set());
    setIndustryFilter("all");
    setCountryFilter("all");
    setBusinessTypeFilter("all");
    setLeadGenTypeFilter("all");
    setServiceFilter("all");
    setConfidenceFilter("all");
    setCampaignFilter("all");
  }

  function handleExport() {
    const rows = table.getFilteredRowModel().rows.map((r) => ({
      ...r.original,
      campaignName: campaigns.find((c) => c.id === r.original.campaignId)?.name || "",
    }));
    const csv = toCsv(rows, [
      { key: "company", header: "Company" },
      { key: "name", header: "Contact" },
      { key: "email", header: "Email" },
      { key: "campaignName", header: "Campaign" },
      { key: "industry", header: "Industry" },
      { key: "businessType", header: "Business Type" },
      { key: "country", header: "Country" },
      { key: "status", header: "Status" },
      { key: "serviceOffered", header: "Service Offered" },
      { key: "confidence", header: "Confidence" },
      { key: "demoType", header: "Demo Type" },
      { key: "lastContact", header: "Last Contact" },
      { key: "followUpCount", header: "Follow-up Count" },
    ]);
    downloadCsv(`biggbee-leads-${new Date().toISOString().slice(0, 10)}.csv`, csv);
  }

  const selectedCount = Object.keys(rowSelection).length;
  const [bulkPending, setBulkPending] = React.useState(false);
  const [bulkCampaignId, setBulkCampaignId] = React.useState("");
  const [bulkStatus, setBulkStatus] = React.useState<LeadStatus>("New");
  const [bulkDeleteConfirmOpen, setBulkDeleteConfirmOpen] = React.useState(false);

  function selectedEmails() {
    return table.getSelectedRowModel().rows.map((r) => r.original.email);
  }

  async function runBulk(fn: () => Promise<{ success: boolean; message: string }>) {
    if (bulkPending) return; // guard against a fast double-click firing the same action twice
    setBulkPending(true);
    try {
      const result = await fn();
      toast(result.message, result.success ? "success" : "error");
      // Only clear selection once the action actually completed -- a failed action leaves the
      // selected leads selected so the admin can see what didn't apply and retry.
      if (result.success) {
        setRowSelection({});
        router.refresh();
      }
    } catch (err) {
      // A thrown (not returned) failure -- e.g. an expired session -- must still release the
      // pending state, or every bulk button stays disabled for the rest of the session even
      // though the table itself is fine.
      toast(err instanceof Error ? err.message : "Something went wrong. Please try again.", "error");
    } finally {
      setBulkPending(false);
    }
  }

  function handleBulkDelete() {
    if (selectedEmails().length === 0) return;
    setBulkDeleteConfirmOpen(true);
  }

  async function confirmBulkDelete() {
    const emails = selectedEmails();
    setBulkDeleteConfirmOpen(false);
    return runBulk(() => bulkDeleteLeadsAction(emails));
  }

  async function confirmDeleteLead() {
    if (!deletingLead || deletingLeadPending) return;
    setDeletingLeadPending(true);
    try {
      const result = await deleteLeadAction(deletingLead.email);
      toast(result.message, result.success ? "success" : "error");
      if (result.success) {
        setDeletingLead(null);
        router.refresh();
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : "Something went wrong. Please try again.", "error");
    } finally {
      setDeletingLeadPending(false);
    }
  }

  async function handleBulkAssignCampaign() {
    const emails = selectedEmails();
    if (emails.length === 0 || !bulkCampaignId) return;
    return runBulk(() => bulkAssignCampaignAction(emails, bulkCampaignId));
  }

  async function handleBulkChangeStatus() {
    const emails = selectedEmails();
    if (emails.length === 0) return;
    return runBulk(() => bulkChangeStatusAction(emails, bulkStatus));
  }

  async function handleBulkSetTest(isTest: boolean) {
    const emails = selectedEmails();
    if (emails.length === 0) return;
    return runBulk(() => bulkSetTestFlagAction(emails, isTest));
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-tertiary" />
          <Input value={globalFilter} onChange={(e) => setGlobalFilter(e.target.value)} placeholder="Search leads…" className="pl-8" />
        </div>

        <Popover>
          <PopoverTrigger asChild>
            <Button variant="secondary" size="sm">
              <SlidersHorizontal className="h-3.5 w-3.5" />
              Filters
              {activeFilterCount > 0 && <Badge variant="accent">{activeFilterCount}</Badge>}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80" align="start">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-xs font-semibold text-text-primary">Filters</p>
              {activeFilterCount > 0 && (
                <button onClick={clearFilters} className="flex items-center gap-1 text-[11px] text-text-tertiary hover:text-text-primary">
                  <X className="h-3 w-3" /> Clear all
                </button>
              )}
            </div>
            <div className="space-y-3">
              <div>
                <p className="mb-1.5 text-[11px] font-medium text-text-tertiary">Status</p>
                <div className="flex flex-wrap gap-1.5">
                  {LEAD_STATUSES.map((status) => {
                    const active = statusFilter.has(status);
                    return (
                      <button
                        key={status}
                        onClick={() =>
                          setStatusFilter((prev) => {
                            const next = new Set(prev);
                            if (next.has(status)) next.delete(status);
                            else next.add(status);
                            return next;
                          })
                        }
                        className={cn(
                          "rounded-md border px-2 py-1 text-[11px] font-medium transition-colors",
                          active ? cn(STATUS_COLORS[status].bg, STATUS_COLORS[status].text, "border-transparent") : "border-border-subtle text-text-tertiary hover:text-text-primary"
                        )}
                      >
                        {status}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <p className="mb-1.5 text-[11px] font-medium text-text-tertiary">Campaign</p>
                <Select value={campaignFilter} onChange={(e) => setCampaignFilter(e.target.value)}>
                  <option value="all">All campaigns</option>
                  <option value="unassigned">Unassigned</option>
                  {campaigns.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </div>
              <FilterSelect label="Country" value={countryFilter} onChange={setCountryFilter} options={countries} />
              <FilterSelect label="Industry" value={industryFilter} onChange={setIndustryFilter} options={industries} />
              <FilterSelect label="Business Type" value={businessTypeFilter} onChange={setBusinessTypeFilter} options={businessTypes} />
              <FilterSelect label="Lead Generation Type" value={leadGenTypeFilter} onChange={setLeadGenTypeFilter} options={leadGenTypes} />
              <FilterSelect label="Service Offered" value={serviceFilter} onChange={setServiceFilter} options={services} />

              <div>
                <p className="mb-1.5 text-[11px] font-medium text-text-tertiary">Confidence</p>
                <Select value={confidenceFilter} onChange={(e) => setConfidenceFilter(e.target.value)}>
                  {CONFIDENCE_RANGES.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
          </PopoverContent>
        </Popover>

        {testCount > 0 && (
          <Select
            value={dataFilter}
            onChange={(e) => setDataFilter(e.target.value as typeof dataFilter)}
            className="w-40"
            aria-label="Filter by data type"
          >
            <option value="all">All leads</option>
            <option value="production">Production only</option>
            <option value="test">Test only ({testCount})</option>
          </Select>
        )}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="secondary" size="sm">
              <Columns3 className="h-3.5 w-3.5" />
              Columns
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-52">
            <DropdownMenuLabel>Toggle columns</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {table
              .getAllColumns()
              .filter((c) => c.getCanHide())
              .map((column) => (
                <DropdownMenuCheckboxItem key={column.id} checked={column.getIsVisible()} onCheckedChange={(v) => column.toggleVisibility(!!v)}>
                  {typeof column.columnDef.header === "string" ? column.columnDef.header : column.id}
                </DropdownMenuCheckboxItem>
              ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <Button variant="secondary" size="sm" onClick={handleExport}>
          <Download className="h-3.5 w-3.5" />
          Export CSV
        </Button>

        <div className="ml-auto flex items-center gap-2">
          <AddLeadDialog options={addLeadOptions} campaigns={campaigns} />
        </div>
      </div>

      {selectedCount > 0 && (
        <div className="sticky top-14 z-20 flex flex-wrap items-center gap-2.5 rounded-xl border border-accent/40 bg-accent-soft px-3.5 py-2.5 shadow-lg shadow-black/10">
          <Badge variant="accent" className="text-sm">
            {selectedCount} selected{table.getPageCount() > 1 ? " on this page" : ""}
          </Badge>

          <Select value={bulkCampaignId} onChange={(e) => setBulkCampaignId(e.target.value)} disabled={bulkPending} className="h-8 w-40 text-xs">
            <option value="">Assign campaign…</option>
            {campaigns.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
          <Button size="sm" variant="secondary" onClick={handleBulkAssignCampaign} disabled={bulkPending || !bulkCampaignId}>
            Assign
          </Button>

          <Select value={bulkStatus} onChange={(e) => setBulkStatus(e.target.value as LeadStatus)} disabled={bulkPending} className="h-8 w-36 text-xs">
            {LEAD_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
          <Button size="sm" variant="secondary" onClick={handleBulkChangeStatus} disabled={bulkPending}>
            Set status
          </Button>

          <Button size="sm" variant="secondary" onClick={() => handleBulkSetTest(true)} disabled={bulkPending}>
            <FlaskConical className="h-3.5 w-3.5" /> Mark test
          </Button>
          <Button size="sm" variant="secondary" onClick={() => handleBulkSetTest(false)} disabled={bulkPending}>
            Mark production
          </Button>

          <Button size="sm" variant="destructive" onClick={handleBulkDelete} disabled={bulkPending}>
            <Trash2 className="h-3.5 w-3.5" />
            {bulkPending ? "Working…" : "Delete Selected"}
          </Button>
          <button onClick={() => setRowSelection({})} className="ml-auto text-xs font-medium text-text-tertiary hover:text-text-primary">
            Clear selection
          </button>
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-border-subtle">
        <table className="w-full min-w-[1100px] text-left text-sm">
          <thead className="sticky top-0 z-10 bg-surface-raised">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id} className="border-b border-border-strong">
                {headerGroup.headers.map((header) => (
                  <th key={header.id} className="whitespace-nowrap px-3 py-2.5 text-xs font-semibold text-text-secondary" style={{ width: header.getSize() === 150 ? undefined : header.getSize() }}>
                    {header.isPlaceholder ? null : (
                      <button
                        className={cn("flex items-center gap-1", header.column.getCanSort() && "cursor-pointer select-none hover:text-text-primary")}
                        onClick={header.column.getToggleSortingHandler()}
                      >
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {header.column.getCanSort() && <ArrowUpDown className="h-3 w-3 opacity-50" />}
                      </button>
                    )}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody className="divide-y divide-border-subtle">
            {table.getRowModel().rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="py-10">
                  <EmptyState icon={UsersRound} title="No leads match your filters" description="Try adjusting or clearing your filters." action={<Button size="sm" variant="secondary" onClick={clearFilters}>Clear filters</Button>} />
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map((row) => (
                <tr
                  key={row.id}
                  onClick={() => router.push(`/leads/${encodeURIComponent(row.original.email)}`)}
                  className={cn(
                    "cursor-pointer transition-colors hover:bg-panel",
                    row.getIsSelected() && "bg-accent-soft hover:bg-accent-soft"
                  )}
                >
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="whitespace-nowrap px-3 py-2.5 text-text-secondary">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-xs text-text-tertiary">
        <span>
          Showing {table.getRowModel().rows.length} of {filtered.length} leads ({leads.length} total)
        </span>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}>
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>
          <span>
            Page {table.getState().pagination.pageIndex + 1} of {Math.max(1, table.getPageCount())}
          </span>
          <Button variant="secondary" size="sm" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {editingLead && (
        <EditLeadDialog
          lead={editingLead}
          campaigns={campaigns}
          open={Boolean(editingLead)}
          onOpenChange={(v) => !v && setEditingLead(null)}
          hideTrigger
        />
      )}

      <Dialog open={deletingLead !== null} onOpenChange={(v) => !v && setDeletingLead(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-danger">Delete lead</DialogTitle>
            <DialogDescription>
              {deletingLead && (
                <>
                  Delete <span className="font-medium text-text-primary">{deletingLead.company}</span> ({deletingLead.email})? This removes it
                  from the Leads sheet and cannot be undone.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="secondary" size="sm" onClick={() => setDeletingLead(null)} disabled={deletingLeadPending}>
              Cancel
            </Button>
            <Button variant="destructive" size="sm" onClick={confirmDeleteLead} disabled={deletingLeadPending}>
              <Trash2 className="h-3.5 w-3.5" /> {deletingLeadPending ? "Deleting…" : "Delete lead"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={bulkDeleteConfirmOpen} onOpenChange={setBulkDeleteConfirmOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-danger">
              Delete {selectedCount} lead{selectedCount === 1 ? "" : "s"}?
            </DialogTitle>
            <DialogDescription>
              This permanently removes {selectedCount === 1 ? "this lead" : "these leads"} from the Leads sheet and cannot be undone.
            </DialogDescription>
          </DialogHeader>
          {bulkDeleteConfirmOpen && (
            <ul className="max-h-32 space-y-1 overflow-y-auto rounded-lg border border-border-subtle bg-panel p-2.5 text-xs text-text-secondary">
              {table
                .getSelectedRowModel()
                .rows.slice(0, 5)
                .map((r) => (
                  <li key={r.original.email} className="truncate">
                    {r.original.company || r.original.email}
                  </li>
                ))}
              {selectedCount > 5 && <li className="text-text-tertiary">+{selectedCount - 5} more</li>}
            </ul>
          )}
          <DialogFooter>
            <Button variant="secondary" size="sm" onClick={() => setBulkDeleteConfirmOpen(false)} disabled={bulkPending}>
              Cancel
            </Button>
            <Button variant="destructive" size="sm" onClick={confirmBulkDelete} disabled={bulkPending}>
              <Trash2 className="h-3.5 w-3.5" /> {bulkPending ? "Deleting…" : "Delete Leads"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function uniqueSorted(values: (string | undefined)[]): string[] {
  const set = new Set(values.map((v) => v?.trim() || "—"));
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
}) {
  return (
    <div>
      <p className="mb-1.5 text-[11px] font-medium text-text-tertiary">{label}</p>
      <Select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="all">All {label.toLowerCase()}</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </Select>
    </div>
  );
}
