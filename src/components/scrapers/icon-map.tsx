import { MapPin, Camera, Globe, Search, Users, Share2, MessageCircle, Video, Building2, Bot, Database, Radar, type LucideIcon } from "lucide-react";

/**
 * Fixed allowlist a scraper agent's `icon` string is looked up through -- never a dynamic
 * import/eval from admin-supplied text, so an icon name can never become a code-injection vector.
 * Add-Scraper-Agent's icon picker only ever offers these names. lucide-react dropped trademarked
 * brand/logo icons (Instagram, LinkedIn, Facebook, etc.) some versions back, so these are generic
 * stand-ins rather than the real platform marks.
 */
export const SCRAPER_ICONS: Record<string, LucideIcon> = {
  MapPin,
  Camera,
  Globe,
  Search,
  Users,
  Share2,
  MessageCircle,
  Video,
  Building2,
  Bot,
  Database,
  Radar,
};

export const SCRAPER_ICON_NAMES = Object.keys(SCRAPER_ICONS);

export function ScraperIcon({ name, className }: { name: string; className?: string }) {
  const Icon = SCRAPER_ICONS[name] ?? Bot;
  return <Icon className={className} />;
}
