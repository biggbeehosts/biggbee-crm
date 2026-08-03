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

export type UnknownSenderClassification = "Unknown" | "Internal" | "Lead Reply";

export interface UnknownSender {
  timestamp: string | null;
  fromEmail: string;
  subject?: string;
  snippet?: string;
  /** Defaults to "Unknown" for legacy rows with no Classification column value yet. */
  classification: UnknownSenderClassification;
  reviewed: boolean;
  /** Row position in the Unknown_Senders sheet tab, used for targeted updates. */
  rowNumber?: number;
}

export type ErrorSeverity = "critical" | "warning" | "info";
