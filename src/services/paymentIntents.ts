import { createHash, randomUUID } from "node:crypto";
import { Schema, model, models } from "mongoose";
import { isAddress, getAddress } from "ethers";

const schema = new Schema({
  _id: String,
  userId: String,
  wallet: String,
  chainId: Number,
  token: String,
  amount: String,
  recipient: String,
  maxFee: String,
  nonce: String,
  expiresAt: Date,
  digest: String,
  state: {
    type: String,
    enum: [
      "created",
      "authorized",
      "submitted",
      "confirmed",
      "failed",
      "expired",
    ],
  },
  idempotencyKey: String,
  createdAt: Date,
  authorizedAt: Date,
  transactionHash: String,
  userOpHash: String,
});
schema.index({ userId: 1, idempotencyKey: 1 }, { unique: true });
export const PaymentIntent =
  models.PaymentIntent || model("PaymentIntent", schema);
export type IntentTerms = {
  userId: string;
  wallet: string;
  chainId: number;
  token: string;
  amount: string;
  recipient: string;
  maxFee: string;
  nonce: string;
  expiresAt: Date;
};
const integer = (value: string) =>
  typeof value === "string" &&
  /^(0|[1-9]\d{0,77})$/.test(value) &&
  BigInt(value) < 2n ** 256n;
export function intentDigest(input: IntentTerms): string {
  if (
    ![677, 8453, 42161].includes(input.chainId) ||
    ![input.wallet, input.recipient].every(isAddress) ||
    (input.token !== "native" && !isAddress(input.token))
  )
    throw new Error("Unsupported payment identity");
  if (
    !integer(input.amount) ||
    BigInt(input.amount) <= 0n ||
    !integer(input.maxFee) ||
    !input.nonce ||
    !Number.isFinite(input.expiresAt.getTime())
  )
    throw new Error("Invalid payment terms");
  return createHash("sha256")
    .update(
      JSON.stringify([
        "nexuspay-payment-v1",
        input.userId,
        getAddress(input.wallet),
        input.chainId,
        input.token === "native" ? "native" : getAddress(input.token),
        input.amount,
        getAddress(input.recipient),
        input.maxFee,
        input.nonce,
        input.expiresAt.toISOString(),
      ]),
    )
    .digest("hex");
}
export async function createPaymentIntent(
  terms: Omit<IntentTerms, "nonce" | "expiresAt">,
  idempotencyKey: string,
) {
  if (!/^[a-f0-9-]{36}$/i.test(idempotencyKey))
    throw new Error("Invalid idempotency key");
  const existing = await PaymentIntent.findOne({
    userId: terms.userId,
    idempotencyKey,
  });
  if (existing) {
    const retryDigest = intentDigest({
      ...terms,
      nonce: existing.nonce,
      expiresAt: existing.expiresAt,
    });
    if (retryDigest !== existing.digest)
      throw new Error("Idempotency key already used for different terms");
    return existing;
  }
  const input = {
    ...terms,
    nonce: randomUUID(),
    expiresAt: new Date(Date.now() + 5 * 60_000),
  };
  const digest = intentDigest(input);
  try {
    return await PaymentIntent.create({
      _id: randomUUID(),
      ...input,
      digest,
      idempotencyKey,
      state: "created",
      createdAt: new Date(),
    });
  } catch (error: any) {
    if (error.code !== 11000) throw error;
    return createPaymentIntent(terms, idempotencyKey);
  }
}
