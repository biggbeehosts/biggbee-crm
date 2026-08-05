import { redirect } from "next/navigation";

/** Moved under the Automation Hub (Stage 6, Part 1/6). Kept as a redirect so existing
 *  bookmarks/links keep working. */
export default function DemoLibraryRedirect() {
  redirect("/automation-hub/demo-library");
}
