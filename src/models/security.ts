import mongoose, { Schema, type Connection } from "mongoose";

const schemas = {
  Notice: new Schema({
    _id: String,
    userId: String,
    kind: String,
    phone: { type: String, select: false },
    status: { type: String, default: "queued" },
    attempts: { type: Number, default: 0 },
    createdAt: Date,
    nextAttemptAt: Date,
    leaseUntil: Date,
    messageId: String,
  }),
  Event: new Schema(
    {
      _id: String,
      version: Number,
      occurredAt: { type: Date, index: true },
      source: String,
      actorId: String,
      action: { type: String, index: true },
      outcome: String,
      severity: String,
      requestId: String,
      sessionRef: String,
      route: String,
      method: String,
      status: Number,
      chainId: Number,
      wallet: String,
      transactionHash: String,
      intentId: String,
      environment: String,
      deployment: String,
      detail: String,
      ipHash: String,
    },
    { strict: "throw" },
  ),
  RequestContext: new Schema({
    _id: String,
    ip: String,
    userAgent: String,
    expiresAt: Date,
  }),
  Incident: new Schema({
    _id: String,
    eventId: String,
    severity: String,
    title: String,
    status: { type: String, default: "open", index: true },
    createdAt: Date,
    updatedAt: Date,
    acknowledgedBy: String,
    resolution: String,
    attempts: { type: Number, default: 0 },
    delivery: { type: String, default: "queued" },
    nextAttemptAt: Date,
    leaseUntil: Date,
  }),
  Admin: new Schema({
    _id: String,
    role: { type: String, enum: ["viewer", "responder", "administrator"] },
    disabled: Boolean,
    bootstrapHash: String,
    bootstrapExpiresAt: Date,
  }),
  AdminSession: new Schema({
    _id: String,
    adminId: String,
    createdAt: Date,
    expiresAt: Date,
    revokedAt: Date,
  }),
  Credential: new Schema({
    _id: String,
    principalId: { type: String, index: true },
    scope: String,
    publicKey: Buffer,
    counter: Number,
    transports: [String],
    createdAt: Date,
    backedUp: Boolean,
    deviceType: { type: String, enum: ["singleDevice", "multiDevice"] },
  }),
  Challenge: new Schema({
    _id: String,
    principalId: String,
    scope: String,
    purpose: String,
    challenge: String,
    transactionDigest: String,
    transactionKind: String,
    transactionRecipient: String,
    expiresAt: Date,
    sessionRef: String,
    intentId: String,
  }),
  Checkpoint: new Schema({
    _id: String,
    chainId: Number,
    blockNumber: Number,
    blockHash: String,
    updatedAt: Date,
    status: String,
    errorCode: String,
    coverage: String,
  }),
};
schemas.AdminSession.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
schemas.Challenge.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
schemas.RequestContext.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
schemas.Event.index({ occurredAt: -1, _id: -1 });
let connection: Connection | undefined;
export async function securityStore() {
  const uri = process.env.SECURITY_STORE_URL;
  if (!uri) throw new Error("Independent security storage is not configured");
  if (!connection)
    connection = mongoose.createConnection(uri, {
      autoIndex: false,
      serverSelectionTimeoutMS: 3000,
      maxPoolSize: 5,
    });
  try {
    await connection.asPromise();
  } catch (error) {
    // A failed initial server selection rejects asPromise for the lifetime of
    // the cached connection, which would fail every audited write until restart.
    // Drop it so the next request rebuilds a fresh connection and the retry the
    // error message promises can actually succeed.
    const failed = connection;
    connection = undefined;
    void failed.close().catch(() => undefined);
    throw error;
  }
  return Object.fromEntries(
    Object.entries(schemas).map(([name, schema]) => [
      name,
      connection!.models[`Security${name}`] ||
        connection!.model(`Security${name}`, schema),
    ]),
  ) as Record<keyof typeof schemas, mongoose.Model<any>>;
}
export async function closeSecurityStore() {
  await connection?.close();
  connection = undefined;
}
