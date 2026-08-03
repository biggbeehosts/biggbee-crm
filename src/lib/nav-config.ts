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
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  group: "Overview" | "Lead Generation" | "Outreach System" | "Operations";
}

export const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard, group: "Overview" },
  { label: "Leads", href: "/leads", icon: Users, group: "Overview" },
  { label: "Pipeline", href: "/pipeline", icon: Kanban, group: "Overview" },
  { label: "Scraper Agents", href: "/lead-generation/scrapers", icon: Bot, group: "Lead Generation" },
  { label: "Scraping Jobs", href: "/lead-generation/scraping-jobs", icon: ListChecks, group: "Lead Generation" },
  { label: "Scraped Leads", href: "/lead-generation/scraped-leads", icon: UserSearch, group: "Lead Generation" },
  { label: "Campaigns", href: "/campaigns", icon: Target, group: "Outreach System" },
  { label: "Outreach", href: "/outreach", icon: Send, group: "Outreach System" },
  { label: "Lead Memory", href: "/lead-memory", icon: BrainCircuit, group: "Outreach System" },
  { label: "Unknown Senders", href: "/unknown-senders", icon: MailQuestion, group: "Outreach System" },
  { label: "Demo Library", href: "/demo-library", icon: Clapperboard, group: "Outreach System" },
  { label: "Analytics", href: "/analytics", icon: BarChart3, group: "Operations" },
  { label: "Errors", href: "/errors", icon: AlertTriangle, group: "Operations" },
  { label: "Knowledge Base", href: "/knowledge-base", icon: BookOpen, group: "Operations" },
  { label: "Settings", href: "/settings", icon: Settings, group: "Operations" },
];

export const NAV_GROUPS: NavItem["group"][] = ["Overview", "Lead Generation", "Outreach System", "Operations"];
