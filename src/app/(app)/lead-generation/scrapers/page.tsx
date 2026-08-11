import { redirect } from "next/navigation";

/** Moved under the Automation Hub (Stage 6, Part 1) -- Lead Sources is the registry/list/form
 *  component filtered by category (see scraper-registry-section.tsx). Kept as a redirect so
 *  existing bookmarks/links keep working. Scraping Jobs / Scraped Leads stay at their original
 *  paths, unaffected. */
export default function ScraperAgentsRedirect() {
  redirect("/automation-hub/lead-sources");
}
