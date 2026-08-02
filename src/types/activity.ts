export type ActivityType =
  | "email_sent"
  | "email_failed"
  | "lead_added"
  | "demo_assigned"
  | "memory_updated"
  | "validation_failed"
  | "reply_received"
  | "meeting_booked";

export interface ActivityRecord {
  id: string;
  type: ActivityType;
  title: string;
  description?: string;
  leadEmail?: string;
  company?: string;
  timestamp: string;
}
