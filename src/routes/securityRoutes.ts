import {
  Router,
  type Request,
  type Response,
  type RequestHandler,
} from "express";
import {
  createHash,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from "@simplewebauthn/server";
import { securityStore } from "../models/security";
import { auditEvent } from "../services/securityAudit";
import { persistentLimit } from "../middleware/securityControls";
import { VerifiedSession } from "../models/verifiedSession";
import { PaymentIntent } from "../services/paymentIntents";
import { revokeUserSessions } from "../services/sessions";

const router = Router();
const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");
const cookieName = () =>
  process.env.NODE_ENV === "production"
    ? "__Host-nexuspay_security"
    : "nexuspay_security";
const rp = () => ({
  rpID: process.env.SECURITY_RP_ID || "localhost",
  origin: process.env.SECURITY_ORIGIN || "http://localhost:3000",
});
function cookie(req: Request) {
  return req.headers.cookie
    ?.split(";")
    .map((p) => p.trim())
    .find((p) => p.startsWith(`${cookieName()}=`))
    ?.slice(cookieName().length + 1);
}
export const authenticateSecurity: RequestHandler = async (req, res, next) => {
  try {
    const token = cookie(req);
    if (!token || !/^[a-f0-9]{64}$/.test(token))
      return void res.status(401).json({
        success: false,
        message: "Security administrator sign-in required.",
      });
    const store = await securityStore();
    const session = await store.AdminSession.findOne({
      _id: digest(token),
      revokedAt: null,
      expiresAt: { $gt: new Date() },
    }).lean();
    const admin =
      session &&
      (await store.Admin.findOne({
        _id: session.adminId,
        disabled: { $ne: true },
      }).lean());
    if (!session || !admin)
      return void res
        .status(401)
        .json({ success: false, message: "Security session expired." });
    res.locals.securityAdmin = admin;
    res.locals.securitySession = session;
    next();
  } catch {
    res
      .status(503)
      .json({ success: false, message: "Security storage unavailable." });
  }
};
export function securityRole(...roles: string[]): RequestHandler {
  return (_req, res, next) =>
    roles.includes(res.locals.securityAdmin?.role)
      ? next()
      : void res.status(403).json({
          success: false,
          message: "Insufficient security privileges.",
        });
}
export const requireFreshSecurityMutation: RequestHandler = (
  req,
  res,
  next,
) => {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  const signedIn = new Date(
    res.locals.securitySession?.createdAt || 0,
  ).getTime();
  if (signedIn <= Date.now() && signedIn > Date.now() - 5 * 60_000)
    return next();
  res.status(403).json({
    success: false,
    message: "Sign in again with your passkey before making this change.",
  });
};
router.use(persistentLimit("security", 100));
router.post("/enroll/options", async (req, res) => {
  const adminId =
    typeof req.body.adminId === "string" ? req.body.adminId.trim() : "";
  const bootstrapToken =
    typeof req.body.bootstrapToken === "string"
      ? req.body.bootstrapToken.trim()
      : "";
  if (!adminId || !bootstrapToken)
    return res.status(400).json({ success: false });
  const store = await securityStore();
  const admin = await store.Admin.findOne({
    _id: adminId,
    disabled: { $ne: true },
    bootstrapExpiresAt: { $gt: new Date() },
  });
  const tokenDigest = digest(bootstrapToken);
  const bootstrapMatches =
    typeof admin?.bootstrapHash === "string" &&
    Buffer.byteLength(tokenDigest) === Buffer.byteLength(admin.bootstrapHash) &&
    timingSafeEqual(Buffer.from(tokenDigest), Buffer.from(admin.bootstrapHash));
  if (!bootstrapMatches) {
    console.warn("Admin passkey enrollment authorization rejected", {
      adminFound: Boolean(admin),
      bootstrapHashPresent: Boolean(admin?.bootstrapHash),
      tokenMatched: false,
      securityDatabase: store.Admin.db.name,
      securityHost: store.Admin.db.host,
    });
    return res.status(403).json({
      success: false,
      message: "Enrollment authorization invalid or expired.",
    });
  }
  const options = await generateRegistrationOptions({
    rpName: "NexusPay Security",
    rpID: rp().rpID,
    userName: adminId,
    userID: new Uint8Array(Buffer.from(`admin:${adminId}`)),
    attestationType: "none",
    authenticatorSelection: {
      residentKey: "required",
      userVerification: "required",
    },
  });
  const id = randomUUID();
  await store.Challenge.create({
    _id: id,
    principalId: adminId,
    scope: "admin",
    purpose: "enroll",
    challenge: options.challenge,
    expiresAt: new Date(Date.now() + 120_000),
  });
  res.json({ success: true, data: { challengeId: id, options } });
});
router.post("/enroll/verify", async (req, res) => {
  const store = await securityStore();
  const challenge = await store.Challenge.findOneAndDelete({
    _id: String(req.body.challengeId),
    scope: "admin",
    purpose: "enroll",
    expiresAt: { $gt: new Date() },
  });
  const bootstrapToken =
    typeof req.body.bootstrapToken === "string"
      ? req.body.bootstrapToken.trim()
      : "";
  if (!challenge || !bootstrapToken)
    return res.status(403).json({ success: false });
  const admin = await store.Admin.findOne({
    _id: challenge.principalId,
    bootstrapHash: digest(bootstrapToken),
    bootstrapExpiresAt: { $gt: new Date() },
    disabled: { $ne: true },
  });
  if (!admin) return res.status(403).json({ success: false });
  const result = await verifyRegistrationResponse({
    response: req.body.response,
    expectedChallenge: challenge.challenge,
    expectedOrigin: rp().origin,
    expectedRPID: rp().rpID,
    requireUserVerification: true,
  });
  if (!result.verified || !result.registrationInfo)
    return res.status(403).json({
      success: false,
      message:
        "Verify your passkey with your device PIN, fingerprint or face recognition.",
    });
  const consumed = await store.Admin.updateOne(
    { _id: admin._id, bootstrapHash: admin.bootstrapHash },
    { $unset: { bootstrapHash: 1, bootstrapExpiresAt: 1 } },
  );
  if (consumed.modifiedCount !== 1)
    return res.status(409).json({ success: false });
  const c = result.registrationInfo.credential;
  await store.Credential.create({
    _id: c.id,
    principalId: admin._id,
    scope: "admin",
    publicKey: Buffer.from(c.publicKey),
    counter: c.counter,
    transports: c.transports,
    createdAt: new Date(),
    backedUp: result.registrationInfo.credentialBackedUp,
    deviceType: result.registrationInfo.credentialDeviceType,
  });
  await auditEvent({
    source: "operator",
    action: "admin.passkey.enrolled",
    actorId: admin._id,
    outcome: "success",
    severity: "high",
  });
  res.json({ success: true });
});
router.post("/login/options", async (req, res) => {
  const store = await securityStore();
  const adminId =
    typeof req.body.adminId === "string"
      ? req.body.adminId.trim().slice(0, 80)
      : "";
  const credentials = await store.Credential.find({
    principalId: adminId,
    scope: "admin",
  }).lean();
  if (!credentials.length)
    return res.status(409).json({
      success: false,
      message:
        "No passkey is enrolled for this administrator ID. Use first-time administrator enrollment to create one.",
    });
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
    principalId: adminId,
    scope: "admin",
    purpose: "login",
    challenge: options.challenge,
    expiresAt: new Date(Date.now() + 120_000),
  });
  res.json({ success: true, data: { challengeId: id, options } });
});
router.post("/login/verify", async (req, res) => {
  const store = await securityStore();
  const challenge = await store.Challenge.findOneAndDelete({
    _id: String(req.body.challengeId),
    scope: "admin",
    purpose: "login",
    expiresAt: { $gt: new Date() },
  });
  const credential =
    challenge &&
    (await store.Credential.findOne({
      _id: String(req.body.response?.id),
      principalId: challenge.principalId,
      scope: "admin",
    }));
  const admin =
    challenge &&
    (await store.Admin.findOne({
      _id: challenge.principalId,
      disabled: { $ne: true },
    }));
  if (!credential || !admin || !challenge)
    return res
      .status(403)
      .json({ success: false, message: "Sign-in could not be verified." });
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
    {
      $set: {
        counter: result.authenticationInfo.newCounter,
        backedUp: result.authenticationInfo.credentialBackedUp,
        deviceType: result.authenticationInfo.credentialDeviceType,
      },
    },
  );
  if (updated.matchedCount !== 1)
    return res.status(409).json({ success: false });
  const token = randomBytes(32).toString("hex");
  await store.AdminSession.create({
    _id: digest(token),
    adminId: admin._id,
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + 30 * 60_000),
  });
  await auditEvent({
    source: "operator",
    action: "admin.login",
    actorId: admin._id,
    outcome: "success",
  });
  res.cookie(cookieName(), token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 30 * 60_000,
  });
  res.json({ success: true, data: { id: admin._id, role: admin.role } });
});
router.use(authenticateSecurity);
router.get("/me", (_req, res) =>
  res.json({
    success: true,
    data: {
      id: res.locals.securityAdmin._id,
      role: res.locals.securityAdmin.role,
    },
  }),
);
router.post("/logout", async (_req, res) => {
  const store = await securityStore();
  await store.AdminSession.updateOne(
    { _id: res.locals.securitySession._id },
    { $set: { revokedAt: new Date() } },
  );
  res.clearCookie(cookieName(), {
    path: "/",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
  });
  res.json({ success: true });
});
router.get("/overview", async (_req, res) => {
  const store = await securityStore();
  const since = new Date(Date.now() - 86400_000);
  const [events, denied, critical, incidents, checkpoints] = await Promise.all([
    store.Event.countDocuments({ occurredAt: { $gte: since } }),
    store.Event.countDocuments({
      occurredAt: { $gte: since },
      outcome: "denied",
    }),
    store.Incident.countDocuments({ status: "open", severity: "critical" }),
    store.Incident.find({ status: { $ne: "resolved" } })
      .sort({ createdAt: -1 })
      .limit(20)
      .lean(),
    store.Checkpoint.find().lean(),
  ]);
  res.json({
    success: true,
    data: {
      events,
      denied,
      critical,
      incidents,
      checkpoints,
      signing: "blocked-pending-custody-migration",
      independentRetentionVerified: false,
    },
  });
});
router.get("/events", async (req, res) => {
  const store = await securityStore();
  const filter: Record<string, unknown> = {};
  for (const field of [
    "actorId",
    "action",
    "outcome",
    "transactionHash",
    "requestId",
    "source",
  ])
    if (
      typeof req.query[field] === "string" &&
      /^[a-zA-Z0-9:._/-]{1,160}$/.test(req.query[field] as string)
    )
      filter[field] = req.query[field];
  if (typeof req.query.before === "string") {
    try {
      if (req.query.before.length > 700) throw new Error("Invalid cursor");
      const cursor = JSON.parse(
        Buffer.from(req.query.before, "base64url").toString(),
      );
      const date = new Date(cursor.time);
      if (
        !Number.isFinite(date.getTime()) ||
        typeof cursor.id !== "string" ||
        !/^[a-zA-Z0-9:._-]{1,250}$/.test(cursor.id)
      )
        throw new Error("Invalid cursor");
      filter.$or = [
        { occurredAt: { $lt: date } },
        { occurredAt: date, _id: { $lt: cursor.id } },
      ];
    } catch {
      return res
        .status(400)
        .json({ success: false, message: "Invalid cursor" });
    }
  }
  const rows = await store.Event.find(filter)
    .sort({ occurredAt: -1, _id: -1 })
    .limit(51)
    .lean();
  await auditEvent({
    source: "operator",
    action: "admin.events.viewed",
    actorId: res.locals.securityAdmin._id,
    outcome: "success",
  });
  res.json({
    success: true,
    data: {
      events: rows.slice(0, 50),
      nextCursor:
        rows.length > 50
          ? Buffer.from(
              JSON.stringify({ time: rows[49].occurredAt, id: rows[49]._id }),
            ).toString("base64url")
          : null,
    },
  });
});
router.get(
  "/events/:id/context",
  securityRole("administrator"),
  async (req, res) => {
    if (
      Date.now() - new Date(res.locals.securitySession.createdAt).getTime() >
      5 * 60_000
    )
      return res.status(403).json({
        success: false,
        message: "Sign in again with your passkey to view restricted context.",
      });
    const store = await securityStore();
    const context = await store.RequestContext.findById(String(req.params.id))
      .select("ip userAgent")
      .lean();
    await auditEvent({
      source: "operator",
      action: "admin.request-context.viewed",
      actorId: res.locals.securityAdmin._id,
      outcome: "success",
    });
    res.json({ success: true, data: context });
  },
);
router.post(
  "/incidents/:id/acknowledge",
  securityRole("responder", "administrator"),
  async (req, res) => {
    if (
      Date.now() - new Date(res.locals.securitySession.createdAt).getTime() >
      5 * 60_000
    )
      return res.status(403).json({
        success: false,
        message: "Sign in again with your passkey before changing an incident.",
      });
    const store = await securityStore();
    const result = await store.Incident.updateOne(
      { _id: String(req.params.id), status: "open" },
      {
        $set: {
          status: "acknowledged",
          acknowledgedBy: res.locals.securityAdmin._id,
          updatedAt: new Date(),
        },
      },
    );
    await auditEvent({
      source: "operator",
      action: "incident.acknowledged",
      actorId: res.locals.securityAdmin._id,
      outcome: result.modifiedCount ? "success" : "denied",
      detail: String(req.params.id),
    });
    res
      .status(result.modifiedCount ? 200 : 409)
      .json({ success: !!result.modifiedCount });
  },
);
router.get("/sessions", async (req, res) => {
  const filter: Record<string, unknown> = {
    revokedAt: null,
    expiresAt: { $gt: new Date() },
  };
  if (typeof req.query.account === "string") {
    if (!/^[a-f0-9]{24}$/i.test(req.query.account))
      return res.status(400).json({ success: false });
    filter.userId = req.query.account;
  }
  const rows = await VerifiedSession.find(filter)
    .select("_id userId createdAt expiresAt userAgent")
    .sort({ createdAt: -1 })
    .limit(50)
    .lean();
  await auditEvent({
    source: "operator",
    action: "admin.sessions.viewed",
    actorId: res.locals.securityAdmin._id,
    outcome: "success",
  });
  res.json({ success: true, data: rows });
});
router.get("/payments", async (_req, res) => {
  const rows = await PaymentIntent.find()
    .select(
      "_id userId wallet chainId token amount recipient maxFee state createdAt transactionHash userOpHash",
    )
    .sort({ createdAt: -1 })
    .limit(50)
    .lean();
  await auditEvent({
    source: "operator",
    action: "admin.payments.viewed",
    actorId: res.locals.securityAdmin._id,
    outcome: "success",
  });
  res.json({ success: true, data: rows });
});
router.post(
  "/accounts/:id/revoke-sessions",
  securityRole("administrator"),
  async (req, res) => {
    if (!/^[a-f0-9]{24}$/i.test(String(req.params.id)))
      return res.status(400).json({ success: false });
    if (
      Date.now() - new Date(res.locals.securitySession.createdAt).getTime() >
      5 * 60_000
    )
      return res.status(403).json({
        success: false,
        message:
          "Sign in again with your passkey before revoking customer sessions.",
      });
    await auditEvent({
      source: "operator",
      action: "admin.account.sessions.revoke-requested",
      actorId: res.locals.securityAdmin._id,
      outcome: "observed",
      severity: "high",
      detail: String(req.params.id),
    });
    await revokeUserSessions(String(req.params.id));
    res.json({ success: true });
  },
);
router.post(
  "/incidents/:id/resolve",
  securityRole("responder", "administrator"),
  async (req, res) => {
    if (
      Date.now() - new Date(res.locals.securitySession.createdAt).getTime() >
      5 * 60_000
    )
      return res.status(403).json({
        success: false,
        message: "Sign in again with your passkey.",
      });
    const store = await securityStore();
    if (
      ![
        "reviewed-legitimate",
        "contained",
        "duplicate",
        "false-positive",
      ].includes(req.body.resolution)
    )
      return res
        .status(400)
        .json({ success: false, message: "Select a supported resolution." });
    await auditEvent({
      source: "operator",
      action: "incident.resolution.requested",
      actorId: res.locals.securityAdmin._id,
      outcome: "observed",
      detail: String(req.params.id),
    });
    const result = await store.Incident.updateOne(
      { _id: String(req.params.id), status: "acknowledged" },
      {
        $set: {
          status: "resolved",
          resolution: req.body.resolution,
          updatedAt: new Date(),
        },
      },
    );
    res
      .status(result.modifiedCount ? 200 : 409)
      .json({ success: !!result.modifiedCount });
  },
);
export default router;
