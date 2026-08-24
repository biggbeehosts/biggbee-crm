import type { UnknownSender } from "@/types";
import { DEFAULT_WORKSPACE_ID } from "@/types";

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();

const RAW_MOCK_UNKNOWN_SENDERS: Omit<UnknownSender, "workspaceId">[] = [
  {
    timestamp: daysAgo(2),
    fromEmail: "marketing-noreply@somevendor.com",
    subject: "Re: Your subscription",
    snippet: "Automated vendor notification, not a lead reply.",
    classification: "Unknown",
    reviewed: false,
    rowNumber: 2,
  },
  {
    timestamp: daysAgo(6),
    fromEmail: "j.patel.personal@gmail.com",
    subject: "Question about Brightside Dental",
    snippet: "Replied from a personal address instead of the clinic's listed email -- could not auto-match to a lead row.",
    classification: "Unknown",
    reviewed: false,
    rowNumber: 3,
  },
  {
    timestamp: daysAgo(1),
    fromEmail: "office@biggbees.com",
    subject: "Biggbee outbound report — 3 email(s) sent",
    snippet: "Internal workflow run summary -- excluded from prospect-reply views by default.",
    classification: "Internal",
    reviewed: true,
    rowNumber: 4,
  },
];

export const MOCK_UNKNOWN_SENDERS: UnknownSender[] = RAW_MOCK_UNKNOWN_SENDERS.map((s) => ({ ...s, workspaceId: DEFAULT_WORKSPACE_ID }));
