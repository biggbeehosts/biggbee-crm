"use client";

import * as React from "react";
import type { LeadMemory } from "@/types";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Drawer, DrawerBody, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription } from "@/components/ui/drawer";
import { daysSince, formatDateTime, formatRelativeTime } from "@/lib/utils/date";
import { truncate } from "@/lib/utils/format";
import { BrainCircuit, Search } from "lucide-react";
import Link from "next/link";

const STALE_DAYS_DEFAULT = 14;

export function MemoryTable({ memory }: { memory: LeadMemory[] }) {
  const [search, setSearch] = React.useState("");
  const [interest, setInterest] = React.useState("all");
  const [meeting, setMeeting] = React.useState("all");
  const [demoSent, setDemoSent] = React.useState("all");
  const [freshness, setFreshness] = React.useState("all");
  const [staleDays, setStaleDays] = React.useState(STALE_DAYS_DEFAULT);
  const [selected, setSelected] = React.useState<LeadMemory | null>(null);

  const interestLevels = React.useMemo(() => {
    const set = new Set(memory.map((m) => m.interestLevel?.trim()).filter(Boolean) as string[]);
    return Array.from(set).sort();
  }, [memory]);

  const filtered = memory.filter((m) => {
    if (search && !`${m.email} ${m.servicesDiscussed} ${m.painPoints} ${m.lastSummary}`.toLowerCase().includes(search.toLowerCase())) return false;
    if (interest !== "all" && (m.interestLevel || "—") !== interest) return false;
    if (meeting !== "all" && m.meetingBooked !== (meeting === "yes")) return false;
    if (demoSent !== "all" && m.demoSent !== (demoSent === "yes")) return false;
    const age = daysSince(m.updatedAt);
    if (freshness === "stale" && !(age === null || age > staleDays)) return false;
    if (freshness === "recent" && !(age !== null && age <= 7)) return false;
    return true;
  });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-tertiary" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search memory…" className="pl-8" />
        </div>
        <Select value={interest} onChange={(e) => setInterest(e.target.value)} className="w-44">
          <option value="all">Any interest level</option>
          {interestLevels.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </Select>
        <Select value={meeting} onChange={(e) => setMeeting(e.target.value)} className="w-40">
          <option value="all">Meeting: any</option>
          <option value="yes">Meeting booked</option>
          <option value="no">No meeting</option>
        </Select>
        <Select value={demoSent} onChange={(e) => setDemoSent(e.target.value)} className="w-36">
          <option value="all">Demo: any</option>
          <option value="yes">Demo sent</option>
          <option value="no">No demo</option>
        </Select>
        <Select value={freshness} onChange={(e) => setFreshness(e.target.value)} className="w-44">
          <option value="all">Any freshness</option>
          <option value="recent">Updated in last 7 days</option>
          <option value="stale">Stale (see threshold)</option>
        </Select>
        <div className="flex items-center gap-1.5 text-xs text-text-tertiary">
          Stale after
          <Input
            type="number"
            min={1}
            value={staleDays}
            onChange={(e) => setStaleDays(Math.max(1, Number(e.target.value) || STALE_DAYS_DEFAULT))}
            className="h-8 w-16 text-center"
          />
          days
        </div>
      </div>

      <Card className="overflow-hidden">
        {filtered.length === 0 ? (
          <EmptyState icon={BrainCircuit} title="No memory entries match" className="m-5" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1000px] text-left text-sm">
              <thead className="bg-surface-raised text-xs text-text-tertiary">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Email</th>
                  <th className="px-4 py-2.5 font-medium">Services Discussed</th>
                  <th className="px-4 py-2.5 font-medium">Pain Points</th>
                  <th className="px-4 py-2.5 font-medium">Interest</th>
                  <th className="px-4 py-2.5 font-medium">Meeting</th>
                  <th className="px-4 py-2.5 font-medium">Demo</th>
                  <th className="px-4 py-2.5 font-medium">Last Summary</th>
                  <th className="px-4 py-2.5 font-medium">Updated</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {filtered.map((m) => {
                  const age = daysSince(m.updatedAt);
                  const isStale = age === null || age > staleDays;
                  return (
                    <tr key={m.email} onClick={() => setSelected(m)} className="cursor-pointer transition-colors hover:bg-panel">
                      <td className="px-4 py-2.5 font-medium text-text-primary">{m.email}</td>
                      <td className="px-4 py-2.5 text-text-secondary">{m.servicesDiscussed || "—"}</td>
                      <td className="max-w-[200px] truncate px-4 py-2.5 text-text-secondary">{m.painPoints || "—"}</td>
                      <td className="px-4 py-2.5">{m.interestLevel ? <Badge variant="accent">{m.interestLevel}</Badge> : "—"}</td>
                      <td className="px-4 py-2.5">
                        <Badge variant={m.meetingBooked ? "success" : "outline"}>{m.meetingBooked ? "Yes" : "No"}</Badge>
                      </td>
                      <td className="px-4 py-2.5">
                        <Badge variant={m.demoSent ? "success" : "outline"}>{m.demoSent ? "Yes" : "No"}</Badge>
                      </td>
                      <td className="max-w-[240px] truncate px-4 py-2.5 text-text-secondary">{m.lastSummary ? truncate(m.lastSummary, 60) : "—"}</td>
                      <td className="px-4 py-2.5">
                        <span className={isStale ? "font-medium text-warning" : "text-text-tertiary"}>
                          {formatRelativeTime(m.updatedAt)}
                          {isStale && " · stale"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Drawer open={!!selected} onOpenChange={(v) => !v && setSelected(null)}>
        <DrawerContent>
          {selected && (
            <>
              <DrawerHeader>
                <DrawerTitle>{selected.email}</DrawerTitle>
                <DrawerDescription>AI lead memory record</DrawerDescription>
              </DrawerHeader>
              <DrawerBody className="space-y-4">
                <DetailField label="Services Discussed" value={selected.servicesDiscussed} />
                <DetailField label="Pain Points" value={selected.painPoints} />
                <DetailField label="Interest Level" value={selected.interestLevel} />
                <DetailField label="Meeting Booked" value={selected.meetingBooked ? "Yes" : "No"} />
                <DetailField label="Demo Sent" value={selected.demoSent ? "Yes" : "No"} />
                <DetailField label="Last Subject" value={selected.lastSubject} />
                <DetailField label="Last Summary" value={selected.lastSummary} />
                <DetailField label="Updated At" value={formatDateTime(selected.updatedAt)} />
                <DetailField label="Last Contacted At" value={formatDateTime(selected.lastContactedAt)} />
                <Link href={`/leads/${encodeURIComponent(selected.email)}`} className="inline-block text-xs font-medium text-accent hover:underline">
                  Open full lead profile →
                </Link>
              </DrawerBody>
            </>
          )}
        </DrawerContent>
      </Drawer>
    </div>
  );
}

function DetailField({ label, value }: { label: string; value?: string }) {
  return (
    <div>
      <p className="text-[11px] font-medium text-text-tertiary">{label}</p>
      <p className="mt-0.5 text-sm text-text-primary">{value || "—"}</p>
    </div>
  );
}
