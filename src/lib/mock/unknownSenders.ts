import type { UnknownSender } from "@/types";

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();

export const MOCK_UNKNOWN_SENDERS: UnknownSender[] = [
  {
    timestamp: daysAgo(2),
    fromEmail: "marketing-noreply@somevendor.com",
    subject: "Re: Your subscription",
    snippet: "Automated vendor notification, not a lead reply.",
  },
  {
    timestamp: daysAgo(6),
    fromEmail: "j.patel.personal@gmail.com",
    subject: "Question about Brightside Dental",
    snippet: "Replied from a personal address instead of the clinic's listed email -- could not auto-match to a lead row.",
  },
];
