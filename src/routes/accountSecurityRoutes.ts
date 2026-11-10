import { queueSecurityNotice } from "../services/securityAlerts";
import { Router, type RequestHandler } from "express";
import { randomUUID, randomBytes } from "node:crypto";
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from "@simplewebauthn/server";
import { authenticate } from "../middleware/auth";
import {
  requireFreshAuthentication,
  persistentLimit,
} from "../middleware/securityControls";
import { VerifiedSession } from "../models/verifiedSession";
import { securityStore } from "../models/security";
import { clearSessionCookie, revokeUserSessions } from "../services/sessions";
import { auditEvent } from "../services/securityAudit";
import {
  createPaymentApprovalOptions,
  PaymentApprovalError,
} from "../services/passkeyPaymentAuthorization";

const router = Router();
router.use(authenticate);
router.get(["/me", "/profile"], (req, res) =>
  res.json({
    success: true,
    data: {
      user: {
        id: String(req.user._id),
        name: req.user.name,
        email: req.user.email,
        phoneNumber: req.user.phoneNumber,
        walletAddress: req.user.walletAddress,
        walletStatus:
          req.user.walletStatus ||
          (req.user.walletAddress ? "ready" : "pending"),
        role: req.user.role,
        isPhoneVerified: req.user.isPhoneVerified,
        isEmailVerified: req.user.isEmailVerified,
        hasPassword: !!req.user.password,
        authMethods: req.user.authMethods,
      },
      sessionActive: true,
    },
  }),
);
router.post(
  "/reauth",
  persistentLimit("reauth", 10),
  requireFreshAuthentication,
  (_req, res) => res.json({ success: true }),
);
router.post(
  "/payment-approvals/options",
  persistentLimit("payment-approval", 20),
  async (req, res) => {
    try {
      const data = await createPaymentApprovalOptions(
        req.user,
        req.authSession,
        req.body,
      );
      res.set("Cache-Control", "no-store").json({ success: true, data });
    } catch (error) {
      const expected = error instanceof PaymentApprovalError;
      const message = expected
        ? error.message
        : "Passkey approval is temporarily unavailable.";
      res.status(expected ? 400 : 503).json({
        success: false,
        error: { code: "PAYMENT_APPROVAL_UNAVAILABLE", message },
      });
    }
  },
);
router.post(
  "/reauth/google/options",
  persistentLimit("reauth-google", 10),
  async (req, res) => {
    const nonce = randomBytes(32).toString("base64url");
    await VerifiedSession.updateOne(
      { _id: req.authSession._id, revokedAt: null },
      {
        $set: {
          reauthGoogleNonce: nonce,
          reauthGoogleExpiresAt: new Date(Date.now() + 120_000),
        },
      },
    );
    res.json({ success: true, data: { nonce } });
  },
);
router.get("/sessions", async (req, res) => {
  const sessions = await VerifiedSession.find({
    userId: String(req.user._id),
    revokedAt: null,
    expiresAt: { $gt: new Date() },
  })
    .select("_id createdAt expiresAt userAgent")
    .sort({ createdAt: -1 })
    .limit(50)
    .lean();
  res.json({
    success: true,
    data: sessions.map((s) => ({
      id: s._id,
      createdAt: s.createdAt,
      expiresAt: s.expiresAt,
      device: s.userAgent,
      current: s._id === req.authSession._id,
    })),
  });
});
router.post("/sessions/revoke-all", async (req, res) => {
  await revokeUserSessions(String(req.user._id));
  clearSessionCookie(res);
  res.json({ success: true });
});
router.post("/sessions/:id/revoke", async (req, res) => {
  if (!/^[a-f0-9]{64}$/.test(String(req.params.id)))
    return res.status(400).json({ success: false });
  const result = await VerifiedSession.updateOne(
    {
      _id: String(req.params.id),
      userId: String(req.user._id),
      revokedAt: null,
    },
    { $set: { revokedAt: new Date() } },
  );
  if (req.params.id === req.authSession._id) clearSessionCookie(res);
  res
    .status(result.matchedCount ? 200 : 404)
    .json({ success: !!result.matchedCount });
});
const passkeyMutationLimit = persistentLimit("passkeys", 20);
router.use("/passkeys", (req, res, next) =>
  req.method === "POST" ? passkeyMutationLimit(req, res, next) : next(),
);
const rp = () => ({
  rpID: process.env.WEBAUTHN_RP_ID || "localhost",
  origin: process.env.APP_ORIGIN || "http://localhost:3000",
});
async function mayEnrollPasskey(req: import("express").Request) {
  const store = await securityStore();
  const principalId = String(req.user._id);
  if (!(await store.Credential.exists({ principalId, scope: "customer" })))
    return true;
  const verifiedAt = new Date(req.authSession.passkeyVerifiedAt || 0).getTime();
  return !!(
    req.authSession.credentialId &&
    verifiedAt > Date.now() - 5 * 60_000 &&
    verifiedAt <= Date.now() &&
    (await store.Credential.exists({
      _id: req.authSession.credentialId,
      principalId,
      scope: "customer",
    }))
  );
}
const requireEnrollmentAuthentication: RequestHandler = async (
  req,
  res,
  next,
) => {
  const store = await securityStore();
  const signedInAt = new Date(req.authSession.authenticatedAt || 0).getTime();
  const recentSignIn =
    signedInAt <= Date.now() && signedInAt > Date.now() - 5 * 60_000;
  const verifiedMethod = ["password", "google", "registration"].includes(
    req.authSession.authenticationMethod,
  );
  const recoveryRestricted =
    new Date(req.user.recoveryRestrictedUntil || 0).getTime() > Date.now();
  if (
    recentSignIn &&
    verifiedMethod &&
    !recoveryRestricted &&
    !(await store.Credential.exists({
      principalId: String(req.user._id),
      scope: "customer",
    }))
  )
    return next();
  return requireFreshAuthentication(req, res, next);
};
router.get("/passkeys", async (req, res) => {
  const store = await securityStore();
  const rows = await store.Credential.find({
    scope: "customer",
    principalId: String(req.user._id),
  })
    .select("_id createdAt backedUp")
    .lean();
  res.json({
    success: true,
    data: rows.map((row) => ({
      id: row._id,
      createdAt: row.createdAt,
      backedUp: row.backedUp,
    })),
  });
});
router.post(
  "/passkeys/register/options",
  requireEnrollmentAuthentication,
  async (req, res) => {
    const store = await securityStore();
    const principalId = String(req.user._id);
    const existing = await store.Credential.find({
      principalId,
      scope: "customer",
    }).lean();
    if (!(await mayEnrollPasskey(req)))
      return res.status(403).json({
        success: false,
        message: "Verify an existing passkey before adding another.",
      });
    const options = await generateRegistrationOptions({
      rpName: "NexusPay",
      rpID: rp().rpID,
      userName: principalId,
      userID: new Uint8Array(Buffer.from(principalId)),
      attestationType: "none",
      excludeCredentials: existing.map((c) => ({ id: c._id })),
      authenticatorSelection: {
        residentKey: "required",
        userVerification: "required",
      },
    });
    const id = randomUUID();
    await store.Challenge.create({
      _id: id,
      principalId,
      scope: "customer",
      purpose: "enroll",
      sessionRef: req.authSession._id,
      challenge: options.challenge,
      expiresAt: new Date(Date.now() + 120_000),
    });
    res.json({ success: true, data: { challengeId: id, options } });
  },
);
router.post(
  "/passkeys/register/verify",
  requireEnrollmentAuthentication,
  async (req, res) => {
    if (!(await mayEnrollPasskey(req)))
      return res.status(403).json({
        success: false,
        message: "Verify an existing passkey before adding another.",
      });
    const store = await securityStore();
    const challenge = await store.Challenge.findOneAndDelete({
      _id: String(req.body.challengeId),
      principalId: String(req.user._id),
      scope: "customer",
      purpose: "enroll",
      sessionRef: req.authSession._id,
      expiresAt: { $gt: new Date() },
    });
    if (!challenge)
      return res
        .status(403)
        .json({ success: false, message: "Passkey challenge expired." });
    const result = await verifyRegistrationResponse({
      response: req.body.response,
      expectedChallenge: challenge.challenge,
      expectedOrigin: rp().origin,
      expectedRPID: rp().rpID,
      requireUserVerification: true,
    });
    if (!result.verified || !result.registrationInfo)
      return res.status(403).json({ success: false });
    await queueSecurityNotice(req.user, "passkey-added", challenge._id);
    const c = result.registrationInfo.credential;
    await store.Credential.create({
      _id: c.id,
      principalId: String(req.user._id),
      scope: "customer",
      publicKey: Buffer.from(c.publicKey),
      counter: c.counter,
      transports: c.transports,
      backedUp: result.registrationInfo.credentialBackedUp,
      createdAt: new Date(),
    });
    await auditEvent({
      source: "server",
      action: "account.passkey.enrolled",
      actorId: String(req.user._id),
      outcome: "success",
      severity: "high",
    });
    res.json({ success: true });
  },
);
router.post("/passkeys/verify/options", async (req, res) => {
  const store = await securityStore();
  const credentials = await store.Credential.find({
    principalId: String(req.user._id),
    scope: "customer",
  }).lean();
  if (!credentials.length)
    return res
      .status(409)
      .json({ success: false, message: "Add a passkey first." });
  const options = await generateAuthenticationOptions({
    rpID: rp().rpID,
    userVerification: "required",
    allowCredentials: credentials.map((c) => ({
      id: c._id,
      transports: c.transports,
    })),
  });
  const id = randomUUID();
  await store.Challenge.create({
    _id: id,
    principalId: String(req.user._id),
    scope: "customer",
    purpose: "reauth",
    sessionRef: req.authSession._id,
    challenge: options.challenge,
    expiresAt: new Date(Date.now() + 120_000),
  });
  res.json({ success: true, data: { challengeId: id, options } });
});
router.post("/passkeys/verify", async (req, res) => {
  const store = await securityStore();
  const challenge = await store.Challenge.findOneAndDelete({
    _id: String(req.body.challengeId),
    principalId: String(req.user._id),
    scope: "customer",
    purpose: "reauth",
    sessionRef: req.authSession._id,
    expiresAt: { $gt: new Date() },
  });
  const credential =
    challenge &&
    (await store.Credential.findOne({
      _id: String(req.body.response?.id),
      principalId: String(req.user._id),
      scope: "customer",
    }));
  if (!challenge || !credential)
    return res.status(403).json({ success: false });
  const result = await verifyAuthenticationResponse({
    response: req.body.response,
    expectedChallenge: challenge.challenge,
    expectedOrigin: rp().origin,
    expectedRPID: rp().rpID,
    requireUserVerification: true,
    credential: {
      id: credential._id,
      publicKey: new Uint8Array(credential.publicKey),
      counter: credential.counter,
      transports: credential.transports,
    },
  });
  if (!result.verified) return res.status(403).json({ success: false });
  const updated = await store.Credential.updateOne(
    { _id: credential._id, counter: credential.counter },
    { $set: { counter: result.authenticationInfo.newCounter } },
  );
  if (!updated.matchedCount) return res.status(409).json({ success: false });
  const session = await VerifiedSession.updateOne(
    { _id: req.authSession._id, revokedAt: null },
    {
      $set: {
        reauthenticatedAt: new Date(),
        passkeyVerifiedAt: new Date(),
        credentialId: credential._id,
      },
    },
  );
  if (!session.matchedCount) return res.status(401).json({ success: false });
  res.json({ success: true });
});
export default router;
