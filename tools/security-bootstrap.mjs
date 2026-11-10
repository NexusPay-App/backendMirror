import { createHash, randomBytes } from "node:crypto";
import mongoose from "mongoose";

const idIndex = process.argv.indexOf("--id");
const adminId = idIndex >= 0 ? process.argv[idIndex + 1] : "";
if (!process.env.SECURITY_STORE_URL) {
  console.error("SECURITY_STORE_URL is missing from the selected environment.");
  process.exit(1);
}
if (!/^[A-Za-z0-9._@-]{3,80}$/.test(adminId)) {
  console.error("Provide an administrator ID with --id (3–80 letters, numbers, dots, underscores, @ or hyphens).");
  process.exit(1);
}

const connection = mongoose.createConnection(process.env.SECURITY_STORE_URL, {
  serverSelectionTimeoutMS: 10000,
  maxPoolSize: 1,
});

try {
  await connection.asPromise();
  const db = connection.db;
  const credentials = db.collection("securitycredentials");
  const admins = db.collection("securityadmins");
  if (await credentials.findOne({ principalId: adminId, scope: "admin" })) {
    throw new Error("This administrator already has a passkey; use passkey sign-in.");
  }

  const now = new Date();
  const existing = await admins.findOne({ _id: adminId });
  if (existing?.disabled === true || (existing && existing.role !== "administrator")) {
    throw new Error("This ID is already assigned to a disabled or non-administrator account.");
  }
  if (existing?.bootstrapHash && existing.bootstrapExpiresAt > now) {
    throw new Error("An unexpired enrollment code already exists for this administrator.");
  }

  const code = randomBytes(32).toString("base64url");
  const expiresAt = new Date(now.getTime() + 60 * 60 * 1000);
  const admin = {
    role: "administrator",
    disabled: false,
    bootstrapHash: createHash("sha256").update(code).digest("hex"),
    bootstrapExpiresAt: expiresAt,
  };

  if (existing) {
    const result = await admins.updateOne(
      {
        _id: adminId,
        role: "administrator",
        disabled: { $ne: true },
        $or: [
          { bootstrapHash: { $exists: false } },
          { bootstrapExpiresAt: { $lte: now } },
        ],
      },
      { $set: admin },
    );
    if (result.modifiedCount !== 1) throw new Error("Administrator state changed; retry after checking its passkey status.");
  } else {
    await admins.insertOne({ _id: adminId, ...admin });
  }

  console.log(`Administrator ID: ${adminId}`);
  console.log(`One-time enrollment code: ${code}`);
  console.log(`Expires: ${expiresAt.toISOString()}`);
} catch (error) {
  const message = error instanceof Error ? error.message : "";
  const safeMessages = [
    "This administrator already has a passkey; use passkey sign-in.",
    "This ID is already assigned to a disabled or non-administrator account.",
    "An unexpired enrollment code already exists for this administrator.",
    "Administrator state changed; retry after checking its passkey status.",
  ];
  console.error(safeMessages.includes(message) ? message : "Could not connect to the security store or provision administrator enrollment.");
  process.exitCode = 1;
} finally {
  await connection.close();
}
