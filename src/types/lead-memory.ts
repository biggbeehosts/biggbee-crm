export interface LeadMemory {
  /** Which workspace this memory row belongs to -- combined with `email`, the real key (same
   *  address may exist independently per workspace, see types/lead.ts). */
  workspaceId: string;
  email: string;
  servicesDiscussed?: string;
  painPoints?: string;
  interestLevel?: string;
  meetingBooked: boolean;
  /** True only after a real, successful send that included a demo (see n8n's Update Lead Memory
   *  After Send, success branch only) -- never merely because a demo was recommended. */
  demoSent: boolean;
  demoId?: string;
  demoSentAt?: string | null;
  demoMatchReason?: string;
  lastSummary?: string;
  updatedAt: string | null;
  lastSubject?: string;
  lastContactedAt: string | null;
}
