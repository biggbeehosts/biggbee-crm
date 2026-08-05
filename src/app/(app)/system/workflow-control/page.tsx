import { redirect } from "next/navigation";

/** Moved under the Automation Hub as "Workflow Manager" (Stage 6, Part 1/5). Kept as a redirect
 *  so existing bookmarks/links keep working. */
export default function WorkflowControlRedirect() {
  redirect("/automation-hub/workflows");
}
