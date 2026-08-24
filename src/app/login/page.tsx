import { redirect } from "next/navigation";
import { accountsExist } from "@/lib/auth/admin-store";
import { Logo } from "@/components/layout/logo";
import { LoginForm } from "./login-form";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  if (!(await accountsExist())) {
    redirect("/setup");
  }
  const { next } = await searchParams;

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center gap-2 text-center">
          <Logo />
          <h1 className="text-lg font-semibold text-text-primary">Sign in</h1>
          <p className="text-xs text-text-tertiary">Internal admin access only.</p>
        </div>
        <LoginForm next={next && next.startsWith("/") ? next : "/dashboard"} />
      </div>
    </div>
  );
}
