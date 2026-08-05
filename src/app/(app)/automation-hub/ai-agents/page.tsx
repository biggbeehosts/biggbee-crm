import { ScraperRegistrySection } from "@/components/scrapers/scraper-registry-section";

export default async function AiAgentsPage() {
  return (
    <ScraperRegistrySection
      category="AI Agent"
      title="AI Agents"
      subtitle="Every non-scraping automation (voice agent, cold calling, appointment booking, imports, ...) — installed the same way, config only."
      emptyDescription="No AI agents registered yet. Add one to point the CRM at an n8n workflow you've built — the same registry pattern that powers Lead Sources."
    />
  );
}
