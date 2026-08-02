import { NextResponse } from "next/server";
import { getConnectionStatus } from "@/lib/data/repository";
import { getEnvStatusSummary } from "@/lib/config/env-validation";

export async function GET() {
  const status = await getConnectionStatus();
  // Coarse summary only -- never the variable names or values behind it.
  const env = getEnvStatusSummary();
  return NextResponse.json({
    ok: true,
    mode: status.mode,
    dataSourceConnected: status.connected,
    envConfigured: env.configured,
    timestamp: new Date().toISOString(),
  });
}
