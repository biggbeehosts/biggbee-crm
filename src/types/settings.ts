/** Client-safe settings shape. Actual secrets (API keys, service account key) never live here. */
export interface AppSettings {
  general: {
    companyName: string;
    website: string;
    senderEmail: string;
    timezone: string;
    dateFormat: string;
  };
  outreach: {
    dailySendCap: number;
    maxPerRun: number;
    rateLimitDelaySeconds: number;
    followUpScheduleDays: number[];
    confidenceThreshold: number;
    lowConfidenceAction: "skip" | "flag" | "send-anyway";
  };
  demoLibrary: {
    cloudinaryCloudName: string;
    autoDeriveDownloadUrls: boolean;
    defaultThumbnailUrl: string;
  };
  notifications: {
    summaryReportRecipient: string;
    sendCompletionReport: boolean;
    sendFailureAlert: boolean;
  };
  appearance: {
    darkMode: boolean;
    compactTables: boolean;
    sidebarCollapsedByDefault: boolean;
  };
}

export interface ConnectionStatus {
  connected: boolean;
  mode: "mock" | "google-sheets";
  spreadsheetIdMasked?: string;
  lastSuccessfulSync?: string | null;
  error?: string;
  /** Required GOOGLE_* variables that are still empty. Names only -- never values. */
  missingEnv?: string[];
}
