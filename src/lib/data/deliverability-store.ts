import "server-only";
import type { InboxPlacementTest, SeedRecipient } from "@/types";
import { readCollection, updateCollection } from "@/lib/store/json-store";

/**
 * Inbox-placement testing data (Stage 5, Part G) -- CRM-owned, not Sheets-backed (there is no
 * "Deliverability" tab; this is admin configuration + manually/adapter-recorded results, same
 * class of data as campaigns/audit-log). A placement result only ever exists here because an
 * admin recorded a real test (manual entry today) or a future provider adapter wrote one -- never
 * inferred from send/open/click/reply data (see src/lib/deliverability/provider-adapter.ts).
 */

const TESTS_COLLECTION = "inbox-placement-tests";
const SEEDS_COLLECTION = "seed-recipients";

export async function getInboxPlacementTests(campaignId?: string): Promise<InboxPlacementTest[]> {
  const all = readCollection<InboxPlacementTest[]>(TESTS_COLLECTION, []);
  const sorted = [...all].sort((a, b) => b.testedAt.localeCompare(a.testedAt));
  return campaignId ? sorted.filter((t) => t.campaignId === campaignId) : sorted;
}

export async function recordInboxPlacementTest(
  test: Omit<InboxPlacementTest, "id" | "createdAt">
): Promise<InboxPlacementTest> {
  const full: InboxPlacementTest = {
    ...test,
    id: `iptest-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
  };
  await updateCollection<InboxPlacementTest[]>(TESTS_COLLECTION, [], (current) => [full, ...current]);
  return full;
}

export async function deleteInboxPlacementTest(id: string): Promise<boolean> {
  let removed = false;
  await updateCollection<InboxPlacementTest[]>(TESTS_COLLECTION, [], (current) => {
    const next = current.filter((t) => t.id !== id);
    removed = next.length !== current.length;
    return next;
  });
  return removed;
}

export async function getSeedRecipients(): Promise<SeedRecipient[]> {
  return readCollection<SeedRecipient[]>(SEEDS_COLLECTION, []);
}

export async function addSeedRecipient(seed: Omit<SeedRecipient, "id" | "createdAt">): Promise<SeedRecipient> {
  const full: SeedRecipient = {
    ...seed,
    id: `seed-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
  };
  await updateCollection<SeedRecipient[]>(SEEDS_COLLECTION, [], (current) => [full, ...current]);
  return full;
}

export async function removeSeedRecipient(id: string): Promise<boolean> {
  let removed = false;
  await updateCollection<SeedRecipient[]>(SEEDS_COLLECTION, [], (current) => {
    const next = current.filter((s) => s.id !== id);
    removed = next.length !== current.length;
    return next;
  });
  return removed;
}

export async function setSeedRecipientActive(id: string, active: boolean): Promise<boolean> {
  let changed = false;
  await updateCollection<SeedRecipient[]>(SEEDS_COLLECTION, [], (current) =>
    current.map((s) => {
      if (s.id === id && s.active !== active) changed = true;
      return s.id === id ? { ...s, active } : s;
    })
  );
  return changed;
}
