import { redirect } from "next/navigation";
import { adminExists } from "@/lib/auth/admin-store";
import { Logo } from "@/components/layout/logo";
import { SetupForm } from "./setup-form";

export default async function SetupPage() {
  // Setup is a one-time flow: once an admin record exists (env-seeded or previously created
  // here), this route refuses to run again and sends the visitor to /login instead.
  if (await adminExists()) {
    redirect("/login");
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center gap-2 text-center">
          <Logo />
          <h1 className="text-lg font-semibold text-text-primary">Create the admin account</h1>
          <p className="text-xs text-text-tertiary">
            This one-time setup is only available because no admin account exists yet. Once created, this page
            becomes unavailable.
          </p>
        </div>
        <SetupForm />
      </div>
    </div>
  );
}
