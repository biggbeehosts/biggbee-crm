export interface DashboardMetrics {
  totalLeads: number;
  emailsSent: number;
  interested: number;
  meetingsBooked: number;
  averageConfidence: number | null;
  failedEmails: number;
}

export interface CountPoint {
  label: string;
  value: number;
}

export interface TimeSeriesPoint {
  date: string;
  sent: number;
  failed: number;
}

/** Stage 5, Part H -- daily unique-open/click/reply counts (see tracking-metrics.ts), distinct
 *  from TimeSeriesPoint's sent/failed shape since it's a different set of series. */
export interface EngagementTimeSeriesPoint {
  date: string;
  opens: number;
  clicks: number;
  replies: number;
}

export interface PipelineCounts {
  New: number;
  Contacted: number;
  Interested: number;
  "Meeting Booked": number;
  Customer: number;
  Failed: number;
  Unsubscribed: number;
}
