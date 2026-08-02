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

export interface UnknownSender {
  timestamp: string | null;
  fromEmail: string;
  subject?: string;
  snippet?: string;
}

export type ErrorSeverity = "critical" | "warning" | "info";
