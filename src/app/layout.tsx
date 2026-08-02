import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { UIStateProvider } from "@/components/layout/ui-state-provider";
import { AppShell } from "@/components/layout/app-shell";
import { getConnectionStatus, getLeads } from "@/lib/data/repository";
import { buildNeedsAttention } from "@/lib/calculations/activity";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Biggbee AI — Outreach CRM",
  description: "Internal CRM dashboard for Biggbee AI's automated outbound outreach system.",
};

// Prevents the light/dark preference from causing a flash of the wrong theme on first paint.
const themeInitScript = `
try {
  var stored = localStorage.getItem('biggbee-crm-theme');
  var theme = stored || 'dark';
  document.documentElement.setAttribute('data-theme', theme);
} catch (e) {}
`;

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const [status, leads] = await Promise.all([getConnectionStatus(), getLeads()]);
  const attentionCount = buildNeedsAttention(leads).length;

  return (
    <html lang="en" data-theme="dark" className={`${inter.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-full bg-canvas text-text-primary">
        <UIStateProvider>
          <AppShell connected={status.connected} mode={status.mode} attentionCount={attentionCount}>
            {children}
          </AppShell>
        </UIStateProvider>
      </body>
    </html>
  );
}
