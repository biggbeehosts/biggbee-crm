import { ScraperRegistrySection } from "@/components/scrapers/scraper-registry-section";

export default async function LeadSourcesPage() {
  return (
    <ScraperRegistrySection
      category="Lead Source"
      title="Lead Sources"
      subtitle="Run existing scrapers through campaign-aware forms — new sources can be added here without a new page."
      emptyDescription="Register a scraper (Google Maps, Instagram, or any future source) — it renders here automatically, no code required."
    />
  );
}
