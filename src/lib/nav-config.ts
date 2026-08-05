import {
  LayoutDashboard,
  Users,
  Kanban,
  Target,
  Send,
  MailQuestion,
  BrainCircuit,
  Clapperboard,
  BarChart3,
  AlertTriangle,
  BookOpen,
  Settings,
  Bot,
  ListChecks,
  UserSearch,
  Cable,
  Activity,
  Inbox,
  Gauge,
  Sparkles,
  Plug,
  SlidersHorizontal,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  group: "Overview" | "Automation Hub" | "Lead Generation" | "Outreach System" | "Operations" | "System";
}

export const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard, group: "Overview" },
  { label: "Leads", href: "/leads", icon: Users, group: "Overview" },
  { label: "Pipeline", href: "/pipeline", icon: Kanban, group: "Overview" },

  // Stage 6, Part 1: single control center for every automation -- every entry below is
  // registry-driven (see scraper-registry-section.tsx, website-registry-view.tsx,
  // workflow-integration-card.tsx); adding a new scraper/agent/workflow/website/demo is a config
  // action on these same pages, never a new route.
  { label: "Overview", href: "/automation-hub", icon: Gauge, group: "Automation Hub" },
  { label: "Lead Sources", href: "/automation-hub/lead-sources", icon: Bot, group: "Automation Hub" },
  { label: "Workflows", href: "/automation-hub/workflows", icon: Cable, group: "Automation Hub" },
  { label: "Demo Library", href: "/automation-hub/demo-library", icon: Clapperboard, group: "Automation Hub" },
  { label: "Knowledge Base", href: "/automation-hub/knowledge-base", icon: BookOpen, group: "Automation Hub" },
  { label: "AI Agents", href: "/automation-hub/ai-agents", icon: Sparkles, group: "Automation Hub" },
  { label: "Integrations", href: "/automation-hub/integrations", icon: Plug, group: "Automation Hub" },
  { label: "Settings", href: "/automation-hub/settings", icon: SlidersHorizontal, group: "Automation Hub" },

  { label: "Scraping Jobs", href: "/lead-generation/scraping-jobs", icon: ListChecks, group: "Lead Generation" },
  { label: "Scraped Leads", href: "/lead-generation/scraped-leads", icon: UserSearch, group: "Lead Generation" },
  { label: "Campaigns", href: "/campaigns", icon: Target, group: "Outreach System" },
  { label: "Outreach", href: "/outreach", icon: Send, group: "Outreach System" },
  { label: "Lead Memory", href: "/lead-memory", icon: BrainCircuit, group: "Outreach System" },
  { label: "Unknown Senders", href: "/unknown-senders", icon: MailQuestion, group: "Outreach System" },
  { label: "Analytics", href: "/analytics", icon: BarChart3, group: "Operations" },
  { label: "Errors", href: "/errors", icon: AlertTriangle, group: "Operations" },
  { label: "Settings", href: "/settings", icon: Settings, group: "Operations" },
  { label: "Tracking", href: "/system/tracking", icon: Activity, group: "System" },
  { label: "Deliverability", href: "/system/deliverability", icon: Inbox, group: "System" },
];

export const NAV_GROUPS: NavItem["group"][] = ["Overview", "Automation Hub", "Lead Generation", "Outreach System", "Operations", "System"];
