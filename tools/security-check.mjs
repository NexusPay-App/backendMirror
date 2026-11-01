import assert from "node:assert/strict";
import { randomBytes, createHash } from "node:crypto";
import mongoose from "mongoose";
import request from "supertest";
import express from "express";
import bcrypt from "bcryptjs";
import { Interface } from "ethers";
const database = `nexuspay_security_tests_${process.pid}`;
Object.assign(process.env, {
  NODE_ENV: "test",
  LOAD_LOCAL_ENV: "false",
  JWT_SECRET: randomBytes(32).toString("hex"),
  DEV_MONGO_URL: `mongodb://127.0.0.1:27028/${database}`,
  SECURITY_STORE_URL: `mongodb://127.0.0.1:27028/${database}_audit`,
  APP_ORIGIN: "http://localhost:3000",
  SECURITY_ORIGIN: "http://localhost:3000",
  ENABLE_MPESA: "false",
});
const { createApp } = await import("../src/app.ts");
const { User } = await import("../src/models/models.ts");
const { Business } = await import("../src/models/businessModel.ts");
const { issueSession, revokeUserSessions } =
  await import("../src/services/sessions.ts");
const { VerifiedSession } = await import("../src/models/verifiedSession.ts");
const { BotPaymentLimit } =
  await import("../src/middleware/botPaymentLimiter.ts");
const { issueChallenge, consumeChallenge, VerificationChallenge } =
  await import("../src/services/verificationChallenges.ts");
const { securityStore, closeSecurityStore } =
  await import("../src/models/security.ts");
const { auditEvent } = await import("../src/services/securityAudit.ts");
const { PaymentIntent, intentDigest, createPaymentIntent } =
  await import("../src/services/paymentIntents.ts");
const { monitorChain, readOnlyRpc, internalNativeMovements } =
  await import("../src/services/securityMonitor.ts");
const { deliverSecurityAlert } =
  await import("../src/services/securityAlerts.ts");
const { privateKeyToAccount } =
  await import("../src/services/signingBoundary.ts");
await mongoose.connect(process.env.DEV_MONGO_URL);
const store = await securityStore();
await Promise.all(
  [
    VerifiedSession,
    BotPaymentLimit,
    VerificationChallenge,
    PaymentIntent,
    ...Object.values(store),
  ].map((m) => m.createIndexes()),
);
const checks = [];
async function check(name, task) {
  await task();
  checks.push(name);
  console.log(`PASS ${name}`);
}
const id = new mongoose.Types.ObjectId();
const userData = {
  _id: id,
  status: "active",
  securityVersion: 0,
  name: "Synthetic test",
  password: "not-a-real-password",
  privateKey: `0x${"1".repeat(64)}`,
  walletAddress: "0x1111111111111111111111111111111111111111",
};
await User.collection.insertOne(userData);
const app = createApp();
const post = (route, cookie = "") =>
  request(app)
    .post(route)
    .set("Origin", "http://localhost:3000")
    .set("X-NexusPay-Request", "1")
    .set("Cookie", cookie);
async function cookieForUser() {
  const issuer = express();
  issuer.get("/", async (req, res) => {
    await issueSession(req, res, await User.findById(id));
    res.json({ sessionActive: true });
  });
  const response = await request(issuer).get("/");
  assert.equal(response.body.token, undefined);
  assert.match(response.headers["set-cookie"][0], /HttpOnly/);
  assert.match(response.headers["set-cookie"][0], /SameSite=Strict/i);
  return response.headers["set-cookie"][0].split(";")[0];
}
try {
  let cookie = await cookieForUser();
  await check("new Google identities can authenticate without a legacy wallet or private key", async () => {
    const { UserOptimizationService } = await import("../src/services/userOptimizationService.ts");
    const identity = await UserOptimizationService.createPersonalAccount({
      email: "local-google-fixture@example.test", googleId: "local-google-fixture", authMethods: ["google"],
    });
    assert.equal(identity.walletStatus, "pending");
    assert.equal(identity.walletAddress, undefined);
    assert.equal(identity.privateKey, undefined);
    const issuer = express();
    issuer.get("/", async (req, res) => { await issueSession(req, res, identity); res.json({ success: true }); });
    const issued = await request(issuer).get("/");
    const pendingCookie = issued.headers["set-cookie"][0].split(";")[0];
    const profile = await request(app).get("/api/auth/me").set("Cookie", pendingCookie);
    assert.equal(profile.status, 200);
    assert.equal(profile.body.data.user.walletStatus, "pending");
    const receive = await request(app).get("/api/token/receive").set("Cookie", pendingCookie);
    assert.equal(receive.status, 409);
    assert.equal(receive.body.error.code, "WALLET_PROVISIONING_PENDING");
    assert.equal((await User.findById(identity._id).select("+privateKey")).privateKey, undefined);
  });

  await check(
    "cookie session works; bearer credentials are rejected",
    async () => {
      assert.equal(
        (await request(app).get("/api/auth/me").set("Cookie", cookie)).status,
        200,
      );
      assert.equal(
        (
          await request(app)
            .get("/api/auth/me")
            .set("Authorization", `Bearer ${cookie.split("=")[1]}`)
        ).status,
        401,
      );
    },
  );
  await check(
    "private keys are excluded from normal account reads and API output",
    async () => {
      assert.equal((await User.findById(id)).privateKey, undefined);
      const profile = await request(app)
        .get("/api/auth/me")
        .set("Cookie", cookie);
      assert.ok(!JSON.stringify(profile.body).includes(userData.privateKey));
      assert.ok(!JSON.stringify(profile.body).includes(userData.password));
    },
  );
  await check(
    "cross-origin, missing-origin and missing-marker mutations fail",
    async () => {
      assert.equal(
        (
          await request(app)
            .post("/api/auth/logout")
            .set("Cookie", cookie)
            .send({})
        ).status,
        403,
      );
      assert.equal(
        (
          await request(app)
            .post("/api/auth/logout")
            .set("Origin", "http://localhost:3000")
            .set("Cookie", cookie)
            .send({})
        ).status,
        403,
      );
      assert.equal(
        (
          await request(app)
            .post("/api/auth/logout")
            .set("Origin", "https://evil.example")
            .set("X-NexusPay-Request", "1")
            .set("Cookie", cookie)
            .send({})
        ).status,
        403,
      );
    },
  );
  await check("logout invalidates the next request", async () => {
    assert.equal((await post("/api/auth/logout", cookie).send({})).status, 200);
    assert.equal(
      (await request(app).get("/api/auth/me").set("Cookie", cookie)).status,
      401,
    );
  });
  cookie = await cookieForUser();
  await check(
    "account security version invalidates all prior sessions",
    async () => {
      await revokeUserSessions(String(id));
      assert.equal(
        (await request(app).get("/api/auth/me").set("Cookie", cookie)).status,
        401,
      );
    },
  );
  cookie = await cookieForUser();
  await check("suspended accounts cannot use an existing session", async () => {
    await User.updateOne({ _id: id }, { $set: { status: "suspended" } });
    assert.equal(
      (await request(app).get("/api/auth/me").set("Cookie", cookie)).status,
      401,
    );
    await User.updateOne({ _id: id }, { $set: { status: "active" } });
  });
  await check("stolen session alone cannot change phone/password", async () => {
    assert.equal(
      (
        await post("/api/auth/settings/add-phone-password", cookie).send({
          phoneNumber: "+254700000002",
          password: "new-password",
        })
      ).status,
      403,
    );
  });
  await check(
    "customers cannot access security admin or another account profile",
    async () => {
      assert.equal(
        (await request(app).get("/api/security/overview").set("Cookie", cookie))
          .status,
        401,
      );
      assert.equal(
        (
          await request(app)
            .get("/api/business/profile/000000000000000000000099")
            .set("Cookie", cookie)
        ).status,
        403,
      );
    },
  );
  await check(
    "customer admin role cannot bypass separate administrator authentication",
    async () => {
      await User.updateOne({ _id: id }, { $set: { role: "admin" } });
      process.env.ENABLE_MPESA = "true";
      try {
        for (const route of [
          "/api/admin/users",
          "/api/platform-wallet/status",
          "/api/mpesa/platform-wallet",
        ])
          assert.equal(
            (await request(app).get(route).set("Cookie", cookie)).status,
            401,
          );
        for (const route of [
          "/api/mpesa/withdraw-fees",
          "/api/mpesa/test-b2b-callback",
        ])
          assert.equal((await post(route, cookie).send({})).status, 401);
      } finally {
        process.env.ENABLE_MPESA = "false";
        await User.updateOne({ _id: id }, { $unset: { role: 1 } });
      }
    },
  );
  await check(
    "business credit assessment is private to its owner",
    async () => {
      const businessId = new mongoose.Types.ObjectId();
      await Business.collection.insertOne({
        _id: businessId,
        userId: new mongoose.Types.ObjectId(),
      });
      const response = await request(app)
        .get(`/api/business/overdraft/assessment/${businessId}`)
        .set("Cookie", cookie);
      assert.equal(response.status, 404);
      assert.equal(response.body.data, undefined);
    },
  );
  await check("recent verified sign-in can enroll a first passkey; stale sessions, extra keys and recovery cannot bypass checks", async () => {
    const issuer = express();
    issuer.get("/", async (req, res) => { await issueSession(req, res, await User.findById(id), "password"); res.json({ success: true }); });
    const result = await request(issuer).get("/");
    const firstCookie = result.headers["set-cookie"][0].split(";")[0];
    const session = await VerifiedSession.findOne({ userId: String(id), authenticationMethod: "password" });
    for (let visit = 0; visit < 21; visit++) assert.equal((await request(app).get("/api/auth/passkeys").set("Cookie", firstCookie)).status, 200);
    assert.equal((await post("/api/auth/passkeys/register/options", firstCookie).send({})).status, 200);
    assert.equal((await post("/api/auth/settings/add-phone-password", firstCookie).send({})).status, 403);
    await VerifiedSession.updateOne({ _id: session._id }, { $set: { authenticatedAt: new Date(Date.now() - 6 * 60_000) } });
    assert.equal((await post("/api/auth/passkeys/register/options", firstCookie).send({})).status, 403);
    await VerifiedSession.updateOne({ _id: session._id }, { $set: { authenticatedAt: new Date() } });
    await store.Credential.create({ _id: "existing-key-enrollment-check", principalId: String(id), scope: "customer" });
    assert.equal((await post("/api/auth/passkeys/register/options", firstCookie).send({})).status, 403);
    await store.Credential.deleteOne({ _id: "existing-key-enrollment-check" });
    await User.updateOne({ _id: id }, { $set: { recoveryRestrictedUntil: new Date(Date.now() + 60_000) } });
    assert.equal((await post("/api/auth/passkeys/register/options", firstCookie).send({})).status, 403);
    await User.updateOne({ _id: id }, { $unset: { recoveryRestrictedUntil: 1 } });
    await VerifiedSession.deleteOne({ _id: session._id });
  });
  await check(
    "password reauthentication cannot reuse an old passkey verification",
    async () => {
      const password = randomBytes(24).toString("hex");
      await User.updateOne(
        { _id: id },
        { $set: { password: await bcrypt.hash(password, 10) } },
      );
      const credentialId = "synthetic-existing-passkey";
      await store.Credential.create({
        _id: credentialId,
        principalId: String(id),
        scope: "customer",
        counter: 0,
      });
      await VerifiedSession.updateMany(
        { userId: String(id), revokedAt: null },
        {
          $set: {
            credentialId,
            reauthenticatedAt: new Date(Date.now() - 600_000),
            passkeyVerifiedAt: new Date(Date.now() - 600_000),
          },
        },
      );
      const response = await post(
        "/api/auth/passkeys/register/options",
        cookie,
      ).send({ currentPassword: password });
      assert.equal(response.status, 403);
      const session = await VerifiedSession.findOne({
        userId: String(id),
        revokedAt: null,
      });
      assert.equal(session.credentialId, undefined);
      assert.equal(session.passkeyVerifiedAt, undefined);
      await store.Credential.deleteOne({ _id: credentialId });
    },
  );
  await check(
    "recovery restrictions apply to approval as well as creation",
    async () => {
      await User.updateOne(
        { _id: id },
        { $set: { recoveryRestrictedUntil: new Date(Date.now() + 60_000) } },
      );
      for (const route of [
        "/api/payment-intents/",
        "/api/payment-intents/pending/approval/options",
        "/api/payment-intents/pending/approve",
      ])
        assert.equal((await post(route, cookie).send({})).status, 403);
      await User.updateOne(
        { _id: id },
        { $unset: { recoveryRestrictedUntil: 1 } },
      );
    },
  );
  await check(
    "OTP is purpose-bound and atomically single use under concurrency",
    async () => {
      await issueChallenge("fixture@example.test", "reset", "234567", {
        userId: String(id),
      });
      assert.equal(
        await consumeChallenge("fixture@example.test", "login", "234567"),
        null,
      );
      const results = await Promise.all(
        Array.from({ length: 8 }, () =>
          consumeChallenge(
            "fixture@example.test",
            "reset",
            "234567",
            String(id),
          ),
        ),
      );
      assert.equal(results.filter(Boolean).length, 1);
    },
  );
  const terms = {
    userId: String(id),
    wallet: userData.walletAddress,
    chainId: 677,
    token: "native",
    amount: "100",
    recipient: "0x2222222222222222222222222222222222222222",
    maxFee: "10",
  };
  await check(
    "intent binds all material terms and rejects mismatched retries",
    async () => {
      const key = "00000000-0000-4000-8000-000000000001";
      const intents = await Promise.all(
        Array.from({ length: 6 }, () => createPaymentIntent(terms, key)),
      );
      assert.equal(new Set(intents.map((i) => i._id)).size, 1);
      const original = intents[0].toObject();
      for (const change of [
        { amount: "101" },
        { chainId: 8453 },
        { recipient: userData.walletAddress },
        { maxFee: "11" },
        { nonce: "different" },
        { expiresAt: new Date(Date.now() + 1000) },
      ]) {
        assert.notEqual(
          intentDigest({ ...original, ...change }),
          original.digest,
        );
      }
      await assert.rejects(() =>
        createPaymentIntent({ ...terms, amount: "999" }, key),
      );
      assert.equal(
        (
          await post(
            `/api/payment-intents/${original._id}/submit`,
            cookie,
          ).send({})
        ).status,
        503,
      );
    },
  );
  await check(
    "audit schema excludes arbitrary payloads and secrets",
    async () => {
      const eventId = await auditEvent({
        source: "server",
        action: "test.redaction",
        outcome: "success",
        password: "never-store",
        detail: "Bearer private secret",
        token: "never-store",
      });
      const record = await store.Event.findById(eventId).lean();
      assert.equal(record.password, undefined);
      assert.equal(record.token, undefined);
      assert.equal(record.detail, undefined);
    },
  );
  await check(
    "unmatched external transfer creates one critical incident; replay is deduplicated",
    async () => {
      const iface = new Interface([
        "event Transfer(address indexed from,address indexed to,uint256 value)",
      ]);
      const data = iface.encodeEventLog(iface.getEvent("Transfer"), [
        userData.walletAddress,
        terms.recipient,
        100n,
      ]);
      const log = {
        ...data,
        address: "0x3333333333333333333333333333333333333333",
        blockHash: "0x" + "a".repeat(64),
        transactionHash: "0x" + "b".repeat(64),
        logIndex: "0x0",
      };
      const rpc = async (method, params) => {
        if (method === "eth_chainId") return "0x2a5";
        if (method === "eth_blockNumber") return "0xc";
        if (method === "eth_getLogs") return [log];
        if (method === "eth_getBlockByNumber")
          return { hash: log.blockHash, transactions: [] };
        throw new Error(`Unexpected ${method}`);
      };
      const input = {
        chainId: 677,
        addresses: [userData.walletAddress],
        tokens: [log.address],
        rpc,
        startBlock: 10,
        confirmations: 1,
      };
      await monitorChain(input);
      await store.Checkpoint.deleteOne({ _id: "677" });
      await monitorChain(input);
      assert.equal(
        await store.Incident.countDocuments({
          title: "wallet.outgoing.unmatched",
        }),
        1,
      );
      assert.equal(
        (await store.Checkpoint.findById("677")).status,
        "partial-coverage",
      );
    },
  );
  await check(
    "alert fallback works and acknowledged incidents stop retrying",
    async () => {
      process.env.SECURITY_ALERT_WEBHOOK = "https://primary.example.test";
      process.env.SECURITY_ALERT_FALLBACK_WEBHOOK =
        "https://fallback.example.test";
      const originalFetch = globalThis.fetch;
      let calls = 0;
      globalThis.fetch = async () => {
        calls++;
        return { ok: calls % 2 === 0 };
      };
      try {
        assert.equal(
          (await deliverSecurityAlert()).status,
          "provider-accepted",
        );
        assert.equal(calls, 2);
        await store.Incident.updateMany(
          {},
          { $set: { status: "acknowledged" } },
        );
        assert.equal((await deliverSecurityAlert()).status, "idle");
        assert.equal(calls, 2);
      } finally {
        globalThis.fetch = originalFetch;
        delete process.env.SECURITY_ALERT_WEBHOOK;
        delete process.env.SECURITY_ALERT_FALLBACK_WEBHOOK;
      }
    },
  );
  await check("security viewer cannot acknowledge incidents", async () => {
    const token = randomBytes(32).toString("hex");
    await store.Admin.create({ _id: "fixture-viewer", role: "viewer" });
    await store.AdminSession.create({
      _id: createHash("sha256").update(token).digest("hex"),
      adminId: "fixture-viewer",
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 60000),
    });
    const viewer = `nexuspay_security=${token}`;
    assert.equal(
      (await request(app).get("/api/security/overview").set("Cookie", viewer))
        .status,
      200,
    );
    assert.equal(
      (
        await post("/api/security/incidents/fixture/acknowledge", viewer).send(
          {},
        )
      ).status,
      403,
    );
  });
  await check(
    "legacy signing and RPC writes are blocked outside unit tests",
    async () => {
      process.env.NODE_ENV = "development";
      assert.throws(() => privateKeyToAccount({}), /Signing is paused/);
      process.env.NODE_ENV = "test";
      await assert.rejects(
        () => readOnlyRpc("https://example.test")("eth_sendRawTransaction", []),
        /not read-only/,
      );
    },
  );
  await check(
    "native tracing excludes reverted and delegate calls and includes successful internal payments",
    async () => {
      const payment = {
        type: "CALL",
        from: userData.walletAddress,
        to: terms.recipient,
        value: "0x64",
      };
      const tree = {
        type: "CALL",
        calls: [
          payment,
          { ...payment, type: "DELEGATECALL" },
          { type: "CALL", error: "reverted", calls: [payment] },
        ],
      };
      const movements = internalNativeMovements(tree);
      assert.equal(movements.length, 1);
      assert.equal(movements[0].value, "100");
      assert.throws(() => internalNativeMovements({ calls: "invalid" }));
    },
  );
  await check(
    "missing receipts stop checkpoint advancement and can be retried",
    async () => {
      const hash = `0x${"c".repeat(64)}`;
      const blockHash = `0x${"d".repeat(64)}`;
      let receipt = null;
      const input = {
        chainId: 8453,
        addresses: [userData.walletAddress],
        tokens: [],
        startBlock: 10,
        confirmations: 1,
        rpc: async (method) => {
          if (method === "eth_chainId") return "0x2105";
          if (method === "eth_blockNumber") return "0xb";
          if (method === "eth_getBlockByNumber")
            return {
              hash: blockHash,
              transactions: [
                {
                  hash,
                  from: terms.recipient,
                  to: userData.walletAddress,
                  value: "0x64",
                },
              ],
            };
          if (method === "eth_getTransactionReceipt") return receipt;
          throw new Error(`Unexpected ${method}`);
        },
      };
      await assert.rejects(() => monitorChain(input), /transaction receipt/);
      assert.equal(await store.Checkpoint.findById("8453"), null);
      receipt = { status: "0x1", blockHash, transactionHash: hash };
      await monitorChain(input);
      assert.equal((await store.Checkpoint.findById("8453")).blockNumber, 10);
    },
  );
  await check(
    "a reorganization hold cannot resume without operator review",
    async () => {
      await store.Checkpoint.create({
        _id: "42161",
        blockNumber: 10,
        blockHash: "fixture",
        status: "reorg-review-required",
      });
      let calls = 0;
      await assert.rejects(
        () =>
          monitorChain({
            chainId: 42161,
            addresses: [],
            tokens: [],
            startBlock: 10,
            confirmations: 1,
            rpc: async () => {
              calls++;
              throw new Error("Must not query held chain");
            },
          }),
        /operator review/,
      );
      assert.equal(calls, 0);
    },
  );
  console.log(
    `Verified ${checks.length} security scenarios using disposable local databases.`,
  );
} finally {
  await mongoose.connection.dropDatabase();
  await store.Event.db.dropDatabase();
  await mongoose.disconnect();
  await closeSecurityStore();
}
