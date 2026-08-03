"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { adminExists, createAdmin, getAdmin } from "./admin-store";
import { hashPassword, verifyPassword } from "./crypto";
import { checkRateLimit, clearLoginFailures, recordLoginFailure } from "./rate-limit";
import { createSessionToken, verifySessionToken, SESSION_COOKIE, sessionCookieOptions } from "./session";
import { logAudit } from "@/lib/audit/log";

export interface AuthActionResult {
  success: boolean;
  message: string;
}

async function clientIp(): Promise<string> {
  const h = await headers();
  // Traefik sets X-Forwarded-For; the app is never reached directly from the internet.
  const forwarded = h.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return h.get("x-real-ip") ?? "unknown";
}

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function loginAction(formData: FormData): Promise<AuthActionResult> {
  const parsed = LoginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { success: false, message: "Enter a valid email and password." };
  }
  const { email, password } = parsed.data;
  const ip = await clientIp();

  const rate = checkRateLimit(email, ip);
  if (!rate.allowed) {
    await logAudit({ actor: email, action: "login.rate_limited", success: false, details: { ip } });
    return {
      success: false,
      message: `Too many failed attempts. Try again in ${Math.ceil((rate.retryAfterSeconds ?? 60) / 60)} minute(s).`,
    };
  }

  const admin = await getAdmin();
  if (!admin) {
    return { success: false, message: "No admin account exists yet. Visit /setup to create one." };
  }

  const valid = admin.email === email.toLowerCase() && (await verifyPassword(password, admin.passwordHash));
  if (!valid) {
    await recordLoginFailure(email, ip);
    await logAudit({ actor: email, action: "login.failed", success: false, details: { ip } });
    return { success: false, message: "Incorrect email or password." };
  }

  await clearLoginFailures(email, ip);
  const token = await createSessionToken(admin.email);
  const store = await cookies();
  store.set(SESSION_COOKIE, token, sessionCookieOptions());
  await logAudit({ actor: admin.email, action: "login.success", success: true, details: { ip } });
  return { success: true, message: "Signed in." };
}

export async function logoutAction(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  store.delete(SESSION_COOKIE);
  if (token) {
    // Best-effort actor identification for the audit trail; a malformed/expired cookie is fine to skip.
    const verified = await verifySessionToken(token);
    if (verified) await logAudit({ actor: verified.session.email, action: "logout", success: true });
  }
  redirect("/login");
}

const SetupSchema = z
  .object({
    email: z.string().email(),
    password: z.string().min(12, "Password must be at least 12 characters."),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"],
  });

export async function setupAction(formData: FormData): Promise<AuthActionResult> {
  if (await adminExists()) {
    return { success: false, message: "Setup has already been completed. Go to /login." };
  }
  const parsed = SetupSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!parsed.success) {
    return { success: false, message: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  try {
    const admin = await createAdmin(parsed.data.email, parsed.data.password);
    const token = await createSessionToken(admin.email);
    const store = await cookies();
    store.set(SESSION_COOKIE, token, sessionCookieOptions());
    await logAudit({ actor: admin.email, action: "admin.setup_completed", success: true });
    return { success: true, message: "Admin account created." };
  } catch (err) {
    return { success: false, message: err instanceof Error ? err.message : "Setup failed." };
  }
}

/** Exposed for scripted/non-interactive provisioning parity with ADMIN_PASSWORD_HASH env docs. */
export async function hashPasswordForEnv(password: string): Promise<string> {
  return hashPassword(password);
}
