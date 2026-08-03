/**
 * HMAC signing built only on the Web Crypto API (globalThis.crypto.subtle) -- deliberately no
 * "server-only" / node:crypto import here. Next.js middleware runs on the Edge runtime by
 * default, which has no Node.js builtins; Web Crypto is the one primitive available in both the
 * Edge runtime and Node.js, so this file is the single implementation used everywhere a session
 * cookie is signed or verified (middleware, and the Node.js server actions in ./actions.ts).
 */

function getAuthSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error(
      "AUTH_SECRET is not set. Generate one with `openssl rand -hex 32` and set it in .env.production -- required to sign session cookies."
    );
  }
  return secret;
}

function hexToBytes(hex: string): ArrayBuffer {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return bytes.buffer;
}

function bytesToHex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function getHmacKey(): Promise<CryptoKey> {
  const secretBytes = new TextEncoder().encode(getAuthSecret());
  return globalThis.crypto.subtle.importKey("raw", secretBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

export async function hmacSign(payload: string): Promise<string> {
  const key = await getHmacKey();
  const signature = await globalThis.crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return bytesToHex(signature);
}

export async function hmacVerify(payload: string, signature: string): Promise<boolean> {
  try {
    const key = await getHmacKey();
    return await globalThis.crypto.subtle.verify("HMAC", key, hexToBytes(signature), new TextEncoder().encode(payload));
  } catch {
    return false;
  }
}
