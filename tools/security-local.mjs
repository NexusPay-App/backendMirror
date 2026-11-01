import { randomBytes, createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const local = path.join(root, ".security-local");
await mkdir(local, { recursive: true, mode: 0o700 });
let credentials;
try {
  credentials = JSON.parse(
    await readFile(path.join(local, "review.json"), "utf8"),
  );
} catch {
  credentials = {
    secret: randomBytes(32).toString("hex"),
    enrollment: randomBytes(32).toString("hex"),
    reviewCode: randomBytes(32).toString("hex"),
  };
  await writeFile(
    path.join(local, "review.json"),
    JSON.stringify(credentials, null, 2),
    { mode: 0o600 },
  );
}
if (!credentials.customerPassword) {
  credentials.customerPassword = randomBytes(24).toString("base64url");
  await writeFile(
    path.join(local, "review.json"),
    JSON.stringify(credentials, null, 2),
    { mode: 0o600 },
  );
}
if (process.argv.includes("--customer")) {
  console.log(
    `Phone: +254700000001\nPassword: ${credentials.customerPassword}`,
  );
  process.exit(0);
}
if (process.argv.includes("--otp")) {
  try {
    const otp = JSON.parse(
      await readFile(path.join(local, "otp-inbox.json"), "utf8"),
    );
    if (new Date(otp.expiresAt).getTime() <= Date.now())
      throw new Error("OTP expired. Request a new code in the app.");
    console.log(
      `Phone: ${otp.phoneNumber}\nPurpose: ${otp.purpose}\nCode: ${otp.code}`,
    );
  } catch (error) {
    console.error(
      error instanceof Error && !("code" in error)
        ? error.message
        : "No local OTP yet. Request a code in the app first.",
    );
    process.exitCode = 1;
  }
  process.exit(process.exitCode || 0);
}
if (process.argv.includes("--enrollment")) {
  const { default: mongoose } = await import("mongoose");
  try {
    await mongoose.connect(
      "mongodb://127.0.0.1:27028/nexuspay_security_audit",
      {
        serverSelectionTimeoutMS: 3000,
      },
    );
    const db = mongoose.connection;
    if (
      await db
        .collection("securitycredentials")
        .countDocuments({ principalId: "local-review", scope: "admin" })
    )
      throw new Error(
        "A passkey is already enrolled. Use Continue with passkey; enrollment is not needed.",
      );
    const result = await db.collection("securityadmins").updateOne(
      {
        _id: "local-review",
        disabled: { $ne: true },
        bootstrapHash: createHash("sha256")
          .update(credentials.enrollment)
          .digest("hex"),
      },
      { $set: { bootstrapExpiresAt: new Date(Date.now() + 3600_000) } },
    );
    if (!result.matchedCount)
      throw new Error(
        "Local enrollment is unavailable. Start npm run dev:security first.",
      );
    console.log(credentials.enrollment);
  } catch (error) {
    console.error(
      error instanceof Error
        ? error.message
        : "Local enrollment could not be renewed.",
    );
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
  process.exit(process.exitCode || 0);
}
// Only the public Google client ID is read from .env; databases stay on loopback.
Object.assign(process.env, {
  NODE_ENV: "development",
  LOAD_LOCAL_ENV: "false",
  DEV_MONGO_URL: "mongodb://127.0.0.1:27028/nexuspay_security_review",
  SECURITY_STORE_URL: "mongodb://127.0.0.1:27028/nexuspay_security_audit",
  JWT_SECRET: credentials.secret,
  APP_ORIGIN: "http://localhost:3000",
  SECURITY_ORIGIN: "http://localhost:3000",
  WEBAUTHN_RP_ID: "localhost",
  SECURITY_RP_ID: "localhost",
  ALLOWED_ORIGINS: "http://localhost:3000",
  ENABLE_SMS: "false",
  ENABLE_MPESA: "false",
  RUN_PAYMENT_WORKERS: "false",
  TRUST_PROXY_HOPS: "0",
});
for (const name of Object.keys(process.env))
  if (
    /^(PROD_|DEV_PLATFORM_|MPESA_|AFRICAS_|THIRDWEB_|ALCHEMY_|GOOGLE_|EMAIL_|SECURITY_ALERT_)/.test(
      name,
    )
  )
    delete process.env[name];
const { parse } = await import("dotenv");
try {
  const publicClientId = parse(
    await readFile(path.join(root, ".env"), "utf8"),
  ).GOOGLE_CLIENT_ID;
  if (
    /^[a-zA-Z0-9_-]+\.apps\.googleusercontent\.com$/.test(publicClientId || "")
  )
    process.env.GOOGLE_CLIENT_ID = publicClientId;
} catch {
  console.warn(
    "Local Google client ID unavailable. Configure GOOGLE_CLIENT_ID in backend .env.",
  );
}
const { default: mongoose } = await import("mongoose");
const { default: express } = await import("express");
const { default: bcrypt } = await import("bcryptjs");
const { User } = await import("../src/models/models.ts");
const { VerifiedSession } = await import("../src/models/verifiedSession.ts");
const { BotPaymentLimit } =
  await import("../src/middleware/botPaymentLimiter.ts");
const { VerificationChallenge } =
  await import("../src/services/verificationChallenges.ts");
const { securityStore } = await import("../src/models/security.ts");
const { PaymentIntent } = await import("../src/services/paymentIntents.ts");
const { issueSession } = await import("../src/services/sessions.ts");
const { SMSService } = await import("../src/services/smsService.ts");
SMSService.sendOTP = async (phoneNumber, code, purpose = "verification") => {
  await writeFile(
    path.join(local, "otp-inbox.json"),
    JSON.stringify({
      phoneNumber,
      code,
      purpose,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
    }),
    { mode: 0o600 },
  );
  console.log("Local OTP ready. Run npm run --silent security:otp to read it.");
  return true;
};
await mongoose.connect(process.env.DEV_MONGO_URL);
const store = await securityStore();
await Promise.all(
  [
    VerifiedSession,
    BotPaymentLimit,
    VerificationChallenge,
    PaymentIntent,
    ...Object.values(store),
  ].map((model) => model.createIndexes()),
);
const id = new mongoose.Types.ObjectId("000000000000000000000001");
await User.collection.updateOne(
  { _id: id },
  {
    $setOnInsert: {
      name: "Local review account",
      phoneNumber: "+254700000001",
      password: await bcrypt.hash(credentials.customerPassword, 10),
      walletAddress: "0x1111111111111111111111111111111111111111",
      status: "active",
      isPhoneVerified: true,
      authMethods: ["phone"],
      securityVersion: 0,
      createdAt: new Date(),
    },
  },
  { upsert: true },
);
const fixture = await User.findById(id);
await User.updateOne(
  { _id: id, walletAddress: "0x1111111111111111111111111111111111111111" },
  {
    $unset: { walletAddress: 1 },
    $set: { walletStatus: "pending" },
  },
);
if (
  fixture?.password &&
  (await bcrypt.compare(credentials.secret, fixture.password))
) {
  await User.updateOne(
    { _id: id, password: fixture.password },
    {
      $set: { password: await bcrypt.hash(credentials.customerPassword, 10) },
      $inc: { securityVersion: 1 },
    },
  );
}
if (
  !(await store.Credential.exists({
    principalId: "local-review",
    scope: "admin",
  }))
) {
  await store.Admin.updateOne(
    { _id: "local-review" },
    {
      $set: {
        role: "administrator",
        disabled: false,
        bootstrapHash: createHash("sha256")
          .update(credentials.enrollment)
          .digest("hex"),
        bootstrapExpiresAt: new Date(Date.now() + 3600_000),
      },
    },
    { upsert: true },
  );
}
const { createApp } = await import("../src/app.ts");
const app = express();
let reviewAvailable = true;
app.get("/api/__local/review-session", async (req, res) => {
  if (!reviewAvailable || req.query.code !== credentials.reviewCode)
    return res.sendStatus(404);
  reviewAvailable = false;
  await issueSession(req, res, await User.findById(id));
  res.redirect("/settings/security");
});
app.use(createApp());
app.listen(8000, "127.0.0.1", () =>
  console.log(
    "Isolated security review API: http://127.0.0.1:8000. Google ID-token verification enabled when configured. OTPs go to the local inbox. No live SMS, transfers or chain workers enabled.",
  ),
);
