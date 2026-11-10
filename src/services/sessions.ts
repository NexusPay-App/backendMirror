import { createHash, randomUUID } from "node:crypto";
import jwt from "jsonwebtoken";
import type { Request, Response } from "express";
import { VerifiedSession } from "../models/verifiedSession";
import { User } from "../models/models";
import { queueSecurityNotice } from "./securityAlerts";
import { createVerifiedSmartWallet } from "./walletProvisioning";

/**
 * Runs at every authentication. Provisions a verified key/address pair when
 * the account has no wallet yet, when the stored key is missing or cannot be
 * decrypted (such accounts hold no funds and no code), or when
 * walletRecreateRequired is set. The write is race-safe: a concurrent login
 * that finished first wins and the slower one discards its result. Failures
 * never block sign-in; the condition stays and the next authentication retries.
 */
async function provisionWallet(user: any, reason: "missing" | "unreadable" | "recreate"): Promise<void> {
  const fresh = await createVerifiedSmartWallet("arbitrum");
  const doc = await User.findById(user._id).select("+privateKey");
  if (!doc) return;
  if (reason === "recreate" && !doc.walletRecreateRequired) return; // another login already recreated it
  if (reason === "missing" && doc.walletAddress) return; // another login already provisioned
  if (reason === "unreadable") {
    let stillBroken = true;
    if (!doc.walletRecreateRequired) {
      try { stillBroken = !doc.privateKey; } catch { stillBroken = true; } // getter throws on undecryptable material
    }
    if (!stillBroken) return; // another login already rotated the key
  }
  const previous = doc.walletAddress;
  doc.privateKey = fresh.privateKey; // schema setter encrypts at rest
  doc.walletAddress = fresh.walletAddress;
  doc.walletStatus = "ready";
  doc.walletRecreateRequired = false;
  if (previous) {
    doc.walletAddressHistory = [
      ...(doc.walletAddressHistory || []),
      { address: previous, replacedAt: new Date(), reason: `wallet-${reason}-on-auth` },
    ];
  }
  await doc.save();
  user.walletAddress = fresh.walletAddress;
  user.walletRecreateRequired = false;
  console.info("[walletAuth] wallet provisioned on authentication", {
    userId: String(user._id),
    reason,
    previous,
    next: fresh.walletAddress,
  });
}

export async function ensureWalletForAuth(user: any): Promise<void> {
  if (!user) return;
  try {
    if (user.walletRecreateRequired) return await provisionWallet(user, "recreate");
    if (!user.walletAddress) return await provisionWallet(user, "missing");
    // Wallet exists: confirm the stored key is present and decrypts before
    // issuing the session.
    let unreadable = false;
    try {
      const doc = await User.findById(user._id).select("+privateKey");
      if (!doc) return;
      try { unreadable = !doc.privateKey; } catch { unreadable = true; }
    } catch (error) {
      // Read failure: fail open — keep the session usable and retry next login.
      console.error("[walletAuth] key check failed; continuing sign-in", {
        userId: String(user._id),
        error: String((error as Error)?.message || error),
      });
      return;
    }
    if (unreadable) await provisionWallet(user, "unreadable");
  } catch (error) {
    console.error("[walletAuth] provisioning failed; retrying on next authentication", {
      userId: String(user._id),
      error: String((error as Error)?.message || error),
    });
  }
}

export const sessionKey = (token: string) =>
  createHash("sha256").update(token).digest("hex");
export const sessionCookie = () =>
  process.env.NODE_ENV === "production"
    ? "__Host-nexuspay_session"
    : "nexuspay_session";
export function requestToken(req: Request): string | undefined {
  return cookieToken(req, sessionCookie());
}
function cookieToken(req: Request, name: string): string | undefined {
  const cookies = (req.headers.cookie || "")
    .split(";")
    .map((part) => part.trim());
  const cookie = cookies.find((part) => part.startsWith(`${name}=`));
  if (!cookie) return undefined;
  try {
    return decodeURIComponent(cookie.slice(cookie.indexOf("=") + 1));
  } catch {
    return undefined;
  }
}
export function requestLogoutTokens(req: Request): string[] {
  const legacyToken =
    sessionCookie() === "nexuspay_session"
      ? undefined
      : cookieToken(req, "nexuspay_session");
  return [
    ...new Set([requestToken(req), legacyToken].filter((token): token is string => !!token)),
  ];
}
export function clearSessionCookie(res: Response) {
  const options = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict" as const,
    path: "/",
  };
  res.clearCookie(sessionCookie(), options);
  if (sessionCookie() !== "nexuspay_session") {
    res.clearCookie("nexuspay_session", { ...options, secure: true });
  }
}
export async function issueSession(
  req: Request,
  res: Response,
  user: any,
  authenticationMethod?: "password" | "google" | "registration",
) {
  if (user.status && user.status !== "active")
    throw new Error("Account unavailable");
  await ensureWalletForAuth(user);
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32)
    throw new Error("Session secret is not configured securely");
  const now = new Date();
  const token = jwt.sign(
    { id: String(user._id), sv: user.securityVersion || 0 },
    secret,
    {
      algorithm: "HS256",
      issuer: "nexuspay",
      audience: "nexuspay-customer",
      expiresIn: "4h",
      jwtid: randomUUID(),
    },
  );
  await VerifiedSession.create({
    _id: sessionKey(token),
    userId: String(user._id),
    verified: true,
    createdAt: now,
    authenticatedAt: now,
    authenticationMethod,
    verifiedAt: now,
    securityVersion: user.securityVersion || 0,
    expiresAt: new Date(now.getTime() + 4 * 3600_000),
    userAgent: (req.get("user-agent") || "").slice(0, 200),
  });
  const previous = requestToken(req);
  if (previous)
    await VerifiedSession.updateOne(
      { _id: sessionKey(previous) },
      { $set: { revokedAt: now } },
    );
  await queueSecurityNotice(user, "login", sessionKey(token));
  res.cookie(sessionCookie(), token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 4 * 3600_000,
  });
  return token;
}
export async function revokeUserSessions(userId: string) {
  await User.updateOne({ _id: userId }, { $inc: { securityVersion: 1 } });
  await VerifiedSession.updateMany(
    { userId, revokedAt: null },
    { $set: { revokedAt: new Date() } },
  );
}
