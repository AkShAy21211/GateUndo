import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";

const ADMIN_COOKIE_NAME = "gateundo_admin_session";
const ADMIN_SESSION_MAX_AGE_SECONDS = 8 * 60 * 60;

function getAdminPassword() {
  return process.env.ADMIN_PASSWORD ?? "";
}

function getAdminSecret() {
  return process.env.ADMIN_SESSION_SECRET || getAdminPassword();
}

function signSession(expiresAt: number) {
  return createHmac("sha256", getAdminSecret())
    .update(String(expiresAt))
    .digest("hex");
}

function safeEqual(firstValue: string, secondValue: string) {
  const firstBuffer = Buffer.from(firstValue);
  const secondBuffer = Buffer.from(secondValue);

  if (firstBuffer.length !== secondBuffer.length) {
    return false;
  }

  return timingSafeEqual(firstBuffer, secondBuffer);
}

export function isAdminConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.SUPABASE_SERVICE_ROLE_KEY &&
      getAdminPassword() &&
      getAdminSecret(),
  );
}

export function isValidAdminPassword(password: string) {
  const adminPassword = getAdminPassword();

  if (!adminPassword) {
    return false;
  }

  return safeEqual(password, adminPassword);
}

export function setAdminSession() {
  const expiresAt = Date.now() + ADMIN_SESSION_MAX_AGE_SECONDS * 1000;
  const signature = signSession(expiresAt);

  cookies().set(ADMIN_COOKIE_NAME, `${expiresAt}.${signature}`, {
    httpOnly: true,
    maxAge: ADMIN_SESSION_MAX_AGE_SECONDS,
    path: "/admin",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
}

export function clearAdminSession() {
  cookies().delete(ADMIN_COOKIE_NAME);
}

export function isAdminAuthenticated() {
  if (!isAdminConfigured()) {
    return false;
  }

  const session = cookies().get(ADMIN_COOKIE_NAME)?.value;

  if (!session) {
    return false;
  }

  const [expiresAtValue, signature] = session.split(".");
  const expiresAt = Number(expiresAtValue);

  if (
    !expiresAt ||
    !signature ||
    !Number.isFinite(expiresAt) ||
    expiresAt <= Date.now()
  ) {
    return false;
  }

  return safeEqual(signature, signSession(expiresAt));
}
