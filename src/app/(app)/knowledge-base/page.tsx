import { redirect } from "next/navigation";

/** Moved under the Automation Hub (Stage 6, Part 1/8). Kept as a redirect so existing
 *  bookmarks/links keep working. */
export default function KnowledgeBaseRedirect() {
  redirect("/automation-hub/knowledge-base");
}
