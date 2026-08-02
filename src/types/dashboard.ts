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

export interface PipelineCounts {
  New: number;
  Contacted: number;
  Interested: number;
  "Meeting Booked": number;
  Customer: number;
  Failed: number;
  Unsubscribed: number;
}
