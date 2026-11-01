import { Router } from "express";
import { randomUUID } from "node:crypto";
import {
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from "@simplewebauthn/server";
import { authenticate } from "../middleware/auth";
import { persistentLimit } from "../middleware/securityControls";
import { ChainAccount } from "../models/chainAccount";
import { securityStore } from "../models/security";
import {
  createPaymentIntent,
  PaymentIntent,
  intentDigest,
} from "../services/paymentIntents";
import { auditEvent } from "../services/securityAudit";
const router = Router();
router.use(authenticate, persistentLimit("payment-intents", 20));
const tokens: Record<number, string[]> = {
  677: ["native", "0xababc7ddc03e501d190c676bf3d92ef0e6e87a3c"],
  8453: ["native", "0x833589fcd6edb6e08f4c7c32d4f71b54bdA02913".toLowerCase()],
  42161: [
    "native",
    "0xaf88d065e77c8cc2239327c5edb3a432268e5831",
    "0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9",
  ],
};
router.use((req, res, next) => {
  if (
    req.user.recoveryRestrictedUntil &&
    new Date(req.user.recoveryRestrictedUntil).getTime() > Date.now()
  )
    return void res.status(403).json({
      success: false,
      message:
        "Payments are temporarily restricted after account recovery or credential changes.",
    });
  next();
});
router.post("/", async (req, res) => {
  const { chainId, token, amount, recipient, maxFee, idempotencyKey } =
    req.body;
  if (
    !Number.isInteger(chainId) ||
    typeof token !== "string" ||
    !tokens[chainId]?.includes(token.toLowerCase())
  )
    return res
      .status(400)
      .json({ success: false, message: "Unsupported payment asset." });
  const account =
    chainId === 677
      ? await ChainAccount.findOne({
          ownerId: req.user._id,
          ownerType: "user",
          chainId,
        })
      : null;
  const wallet = chainId === 677 ? account?.address : req.user.walletAddress;
  if (!wallet)
    return res
      .status(409)
      .json({ success: false, message: "Wallet migration required." });
  const intent = await createPaymentIntent(
    {
      userId: String(req.user._id),
      wallet,
      chainId,
      token,
      amount,
      recipient,
      maxFee,
    },
    idempotencyKey,
  );
  await auditEvent({
    source: "server",
    action: "payment.intent.created",
    actorId: String(req.user._id),
    intentId: intent._id,
    outcome: "success",
    chainId,
  });
  res.json({ success: true, data: intent });
});
router.post("/:id/approval/options", async (req, res) => {
  const intent = await PaymentIntent.findOne({
    _id: String(req.params.id),
    userId: String(req.user._id),
    state: "created",
    expiresAt: { $gt: new Date() },
  });
  if (!intent || intentDigest(intent) !== intent.digest)
    return res
      .status(409)
      .json({ success: false, message: "Payment intent expired or changed." });
  const store = await securityStore();
  const credentials = await store.Credential.find({
    principalId: String(req.user._id),
    scope: "customer",
  }).lean();
  if (!credentials.length)
    return res.status(403).json({
      success: false,
      message: "Add a passkey before approving payments.",
    });
  const options = await generateAuthenticationOptions({
    rpID: process.env.WEBAUTHN_RP_ID || "localhost",
    userVerification: "required",
    challenge: new Uint8Array(Buffer.from(intent.digest, "hex")),
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
    purpose: "payment",
    intentId: intent._id,
    sessionRef: req.authSession._id,
    challenge: options.challenge,
    expiresAt: intent.expiresAt,
  });
  res.json({ success: true, data: { challengeId: id, options, intent } });
});
router.post("/:id/approve", async (req, res) => {
  const store = await securityStore();
  const intent = await PaymentIntent.findOne({
    _id: String(req.params.id),
    userId: String(req.user._id),
    state: "created",
    expiresAt: { $gt: new Date() },
  });
  const challenge = await store.Challenge.findOneAndDelete({
    _id: String(req.body.challengeId),
    principalId: String(req.user._id),
    scope: "customer",
    purpose: "payment",
    intentId: String(req.params.id),
    sessionRef: req.authSession._id,
    expiresAt: { $gt: new Date() },
  });
  const credential =
    challenge &&
    (await store.Credential.findOne({
      _id: String(req.body.response?.id),
      scope: "customer",
      principalId: String(req.user._id),
    }));
  if (
    !intent ||
    intentDigest(intent) !== intent.digest ||
    !challenge ||
    !credential ||
    challenge.challenge !==
      Buffer.from(intent.digest, "hex").toString("base64url")
  )
    return res
      .status(403)
      .json({ success: false, message: "Payment approval invalid." });
  const result = await verifyAuthenticationResponse({
    response: req.body.response,
    expectedChallenge: challenge.challenge,
    expectedOrigin: process.env.APP_ORIGIN || "http://localhost:3000",
    expectedRPID: process.env.WEBAUTHN_RP_ID || "localhost",
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
  await auditEvent({
    source: "server",
    action: "payment.intent.authorized",
    actorId: String(req.user._id),
    intentId: intent._id,
    outcome: "success",
    detail: intent.digest,
  });
  const authorized = await PaymentIntent.findOneAndUpdate(
    {
      _id: intent._id,
      state: "created",
      digest: intent.digest,
      expiresAt: { $gt: new Date() },
    },
    { $set: { state: "authorized", authorizedAt: new Date() } },
    { returnDocument: "after" },
  );
  res
    .status(authorized ? 200 : 409)
    .json({ success: !!authorized, data: authorized });
});
router.post("/:id/submit", (_req, res) =>
  res.status(503).json({
    success: false,
    error: {
      code: "SIGNING_MIGRATION_REQUIRED",
      message:
        "Submission remains disabled until isolated signing and wallet migration are verified.",
    },
  }),
);
export default router;
