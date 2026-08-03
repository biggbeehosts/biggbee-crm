import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";
import { UIStateProvider } from "@/components/layout/ui-state-provider";

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
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  return (
    <html lang="en" data-theme="dark" className={`${inter.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-full bg-canvas text-text-primary">
        <UIStateProvider>{children}</UIStateProvider>
      </body>
    </html>
  );
}
