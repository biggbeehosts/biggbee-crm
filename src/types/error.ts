export interface ErrorRecord {
  id: string;
  timestamp: string | null;
  source?: string;
  leadEmail?: string;
  company?: string;
  errorMessage?: string;
  nodeName?: string;
  validationErrors?: string[];
  validationWarnings?: string[];
}

/** "Needs Review" is the default queue -- anything the CRM can't confidently place elsewhere.
 *  "Internal" and "Lead Reply" are sticky human/n8n decisions, never recomputed once set.
 *  "System Notification" is computed automatically (see isSystemNotificationSender /
 *  isKnownPlatformSender) and re-evaluated on every read, so it self-corrects as the
 *  allowlist/pattern list improves -- it's the only classification besides "Needs Review" that
 *  isn't a deliberate one-time decision. */
export type UnknownSenderClassification = "Unknown" | "Internal" | "Lead Reply" | "System Notification" | "Needs Review";

export interface UnknownSender {
  timestamp: string | null;
  fromEmail: string;
  subject?: string;
  snippet?: string;
  /** Computed at read time for anything that isn't a sticky "Internal"/"Lead Reply" decision --
   *  see normalizeUnknownSender. Defaults to "Needs Review" for legacy rows with no signal. */
  classification: UnknownSenderClassification;
  reviewed: boolean;
  /** Row position in the Unknown_Senders sheet tab, used for targeted updates. */
  rowNumber?: number;
}

export type ErrorSeverity = "critical" | "warning" | "info";
