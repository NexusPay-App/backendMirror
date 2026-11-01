import type { RequestHandler } from "express";
import { createHmac } from "node:crypto";
import bcrypt from "bcryptjs";
import { BotPaymentLimit } from "./botPaymentLimiter";
import { VerifiedSession } from "../models/verifiedSession";
import { verifyGoogleToken } from "../services/googleAuth";

export const csrfProtection: RequestHandler = (req, res, next) => {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  // Provider callbacks and machine workers authenticate using their own signed/shared credentials.
  if (
    /^\/api\/(internal\/|mpesa\/(callback|stk-callback|b2c-callback|b2b-callback|queue-timeout)$)/.test(
      req.path,
    )
  )
    return next();
  const origins = [
    process.env.APP_ORIGIN || "http://localhost:3000",
    process.env.SECURITY_ORIGIN || "http://localhost:3000",
    process.env.ALLOWED_ORIGINS || "",
  ]
    .flatMap((value) => value.split(","))
    .map((value) => value.trim())
    .filter(Boolean);
  if (
    !origins.includes(req.get("origin") || "") ||
    req.get("x-nexuspay-request") !== "1" ||
    !req.is("application/json")
  ) {
    return void res.status(403).json({
      success: false,
      error: {
        code: "REQUEST_ORIGIN_DENIED",
        message: "Request origin could not be verified.",
      },
    });
  }
  next();
};
export function persistentLimit(
  scope: string,
  limit: number,
  windowMs = 15 * 60_000,
): RequestHandler {
  return async (req, res, next) => {
    try {
      const secret = process.env.RATE_LIMIT_SECRET || process.env.JWT_SECRET;
      if (!secret) throw new Error("Rate limit secret missing");
      const bucket = Math.floor(Date.now() / windowMs);
      const identities = [
        req.ip || "unknown",
        req.user?._id?.toString(),
        typeof req.body?.phoneNumber === "string"
          ? req.body.phoneNumber
          : undefined,
        typeof req.body?.email === "string"
          ? req.body.email.toLowerCase()
          : undefined,
      ].filter(Boolean);
      for (const identity of identities) {
        const id = createHmac("sha256", secret)
          .update(`${scope}:${bucket}:${identity}`)
          .digest("hex");
        const record = await BotPaymentLimit.findOneAndUpdate(
          { _id: id },
          {
            $inc: { attempts: 1 },
            $setOnInsert: { expiresAt: new Date((bucket + 2) * windowMs) },
          },
          { upsert: true, returnDocument: "after" },
        );
        if (record.attempts > limit)
          return void res
            .status(429)
            .set(
              "Retry-After",
              String(Math.ceil(((bucket + 1) * windowMs - Date.now()) / 1000)),
            )
            .json({
              success: false,
              message: "Too many attempts. Please wait before trying again.",
            });
      }
      next();
    } catch {
      res.status(503).json({
        success: false,
        message: "Security checks are temporarily unavailable.",
      });
    }
  };
}
export const requireFreshAuthentication: RequestHandler = async (
  req,
  res,
  next,
) => {
  try {
    const recent =
      req.authSession?.reauthenticatedAt &&
      Date.now() - new Date(req.authSession.reauthenticatedAt).getTime() <
        5 * 60_000;
    if (
      req.user.recoveryRestrictedUntil &&
      new Date(req.user.recoveryRestrictedUntil).getTime() > Date.now()
    )
      return void res.status(403).json({
        success: false,
        message: "Security settings are temporarily restricted after recovery.",
      });
    if (recent) return next();
    const password = req.body?.currentPassword;
    let valid =
      typeof password === "string" &&
      password.length <= 128 &&
      req.user?.password &&
      (await bcrypt.compare(password, req.user.password));
    if (
      !valid &&
      typeof req.body?.reauthGoogleToken === "string" &&
      req.user?.googleId
    ) {
      const google = await verifyGoogleToken(req.body.reauthGoogleToken);
      valid =
        google.id === req.user.googleId &&
        google.issuedAt * 1000 > Date.now() - 120_000 &&
        google.nonce &&
        google.nonce === req.authSession.reauthGoogleNonce;
      if (valid) {
        const consumed = await VerifiedSession.updateOne(
          {
            _id: req.authSession._id,
            reauthGoogleNonce: google.nonce,
            reauthGoogleExpiresAt: { $gt: new Date() },
            revokedAt: null,
          },
          { $unset: { reauthGoogleNonce: 1, reauthGoogleExpiresAt: 1 } },
        );
        valid = consumed.modifiedCount === 1;
      }
    }
    if (!valid)
      return void res.status(403).json({
        success: false,
        error: {
          code: "REAUTH_REQUIRED",
          message:
            "Verify your existing password or passkey before changing security settings.",
        },
      });
    const updated = await VerifiedSession.updateOne(
      { _id: req.authSession._id, revokedAt: null },
      {
        $set: { reauthenticatedAt: new Date() },
        $unset: { credentialId: 1, passkeyVerifiedAt: 1 },
      },
    );
    if (!updated.matchedCount)
      return void res.status(401).json({ success: false });
    req.authSession.credentialId = undefined;
    req.authSession.passkeyVerifiedAt = undefined;
    next();
  } catch {
    res.status(403).json({
      success: false,
      message: "Fresh authentication could not be verified.",
    });
  }
};
