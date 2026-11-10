import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { Request } from "express";
import {
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from "@simplewebauthn/server";
import { getAddress, isAddress } from "ethers";
import { Business } from "../models/businessModel";
import { User } from "../models/models";
import { securityStore } from "../models/security";
import { isBotNetwork, type BotNetwork } from "../config/botchain";
import { getBotConfig } from "../config/botchain";
import { getTokenConfig } from "../config/tokens";
import type { Chain, TokenSymbol } from "../types/token";
import { resolveBotAccount } from "./botchainWallet";
import { resolveBotRecipient } from "./botchainTransfers";
import { auditEvent } from "./securityAudit";

type PaymentKind = "send" | "merchant";
export class PaymentApprovalError extends Error {}

function networkOf(body: any, fallback?: string) {
  return String(fallback || body.chain || body.chainName || "")
    .trim()
    .toLowerCase();
}

function termsDigest(
  userId: string,
  kind: PaymentKind,
  body: any,
  recipient: string,
  network?: string,
) {
  const chain = networkOf(body, network);
  const destination =
    kind === "send"
      ? String(body.recipientIdentifier || "").trim()
      : String(body.merchantId || "").trim();
  return createHash("sha256")
    .update(
      JSON.stringify([
        "nexuspay-transaction-approval-v1",
        userId,
        kind,
        chain,
        String(body.senderAddress || "").toLowerCase(),
        String(body.tokenSymbol || "").toUpperCase(),
        String(body.amount ?? ""),
        destination,
        getAddress(recipient),
        String(body.maxNetworkFee || ""),
      ]),
    )
    .digest("hex");
}

async function resolveEvmRecipient(kind: PaymentKind, body: any) {
  if (kind === "merchant") {
    const business = await Business.findOne({ merchantId: body.merchantId })
      .select("walletAddress")
      .lean();
    if (!business?.walletAddress || !isAddress(business.walletAddress))
      throw new PaymentApprovalError("Merchant wallet is unavailable.");
    return getAddress(business.walletAddress);
  }
  const identifier = String(body.recipientIdentifier || "").trim();
  if (isAddress(identifier) as boolean) return getAddress(identifier);
  const user = identifier.includes("@")
    ? await User.findOne({ email: identifier.toLowerCase() })
        .select("walletAddress")
        .lean()
    : await User.findOne({ phoneNumber: identifier })
        .select("walletAddress")
        .lean();
  if (!user?.walletAddress || !isAddress(user.walletAddress))
    throw new PaymentApprovalError("Recipient wallet is unavailable.");
  return getAddress(user.walletAddress);
}

export async function createPaymentApprovalOptions(
  user: any,
  session: any,
  body: any,
) {
  const kind = body.kind as PaymentKind;
  if (kind !== "send" && kind !== "merchant")
    throw new PaymentApprovalError("Unsupported payment type.");
  const network = networkOf(body);
  const token = String(body.tokenSymbol || "").toUpperCase();
  if (
    !network ||
    String(body.amount || "").length > 100 ||
    !/^(0|[1-9]\d{0,77})(\.\d+)?$/.test(String(body.amount || "")) ||
    Number(body.amount) <= 0 ||
    !isAddress(body.senderAddress)
  )
    throw new PaymentApprovalError("Payment details are incomplete.");

  let recipient: string;
  if (isBotNetwork(network)) {
    const config = getBotConfig(network);
    if (
      !config.enabled ||
      !config.transfersEnabled ||
      !config.tokens[token as keyof typeof config.tokens]
    )
      throw new PaymentApprovalError("This BOT Chain payment is unavailable.");
    const account = await resolveBotAccount(user, network as BotNetwork);
    if (account.address.toLowerCase() !== body.senderAddress.toLowerCase())
      throw new PaymentApprovalError(
        "Sender wallet does not match your account.",
      );
    recipient = await resolveBotRecipient(
      network as BotNetwork,
      kind === "send"
        ? { recipientIdentifier: body.recipientIdentifier }
        : { merchantId: body.merchantId },
    );
  } else {
    if (!getTokenConfig(network as Chain, token as TokenSymbol))
      throw new PaymentApprovalError(
        "This asset is unavailable on the selected network.",
      );
    if (
      !user.walletAddress ||
      user.walletAddress.toLowerCase() !== body.senderAddress.toLowerCase()
    )
      throw new PaymentApprovalError(
        "Sender wallet does not match your account.",
      );
    recipient = await resolveEvmRecipient(kind, body);
  }
  if (!isAddress(recipient))
    throw new PaymentApprovalError("Recipient wallet is invalid.");

  const store = await securityStore();
  const credentials = await store.Credential.find({
    principalId: String(user._id),
    scope: "customer",
  }).lean();
  if (!credentials.length)
    throw new PaymentApprovalError(
      "Set up a passkey before using it to approve payments.",
    );

  const challenge = randomBytes(32).toString("base64url");
  const challengeId = randomUUID();
  const expiresAt = new Date(Date.now() + 120_000);
  const options = await generateAuthenticationOptions({
    rpID: process.env.WEBAUTHN_RP_ID || "localhost",
    challenge,
    userVerification: "required",
    allowCredentials: credentials.map((credential) => ({
      id: credential._id,
      transports: credential.transports,
    })),
  });
  await store.Challenge.create({
    _id: challengeId,
    principalId: String(user._id),
    scope: "customer",
    purpose: "transaction",
    sessionRef: session._id,
    challenge,
    transactionDigest: termsDigest(String(user._id), kind, body, recipient),
    transactionKind: kind,
    transactionRecipient: getAddress(recipient),
    expiresAt,
  });
  return {
    challengeId,
    options,
    recipientAddress: getAddress(recipient),
    expiresAt,
  };
}

export async function verifyPaymentApproval(
  req: Request,
  kind: PaymentKind,
  network?: string,
) {
  const approval = req.body?.passkeyApproval;
  if (
    !approval ||
    typeof approval.challengeId !== "string" ||
    !approval.response?.id
  )
    return null;
  const store = await securityStore();
  const filter = {
    _id: approval.challengeId,
    principalId: String(req.user._id),
    scope: "customer",
    purpose: "transaction",
    transactionKind: kind,
    sessionRef: req.authSession._id,
    expiresAt: { $gt: new Date() },
  };
  const challenge = await store.Challenge.findOne(filter).lean();
  if (
    !challenge?.transactionRecipient ||
    !challenge.transactionDigest ||
    challenge.transactionDigest !==
      termsDigest(
        String(req.user._id),
        kind,
        req.body,
        challenge.transactionRecipient,
        network,
      )
  )
    return null;
  const consumed = await store.Challenge.findOneAndDelete(filter).lean();
  if (!consumed) return null;
  const credential = await store.Credential.findOne({
    _id: String(approval.response.id),
    principalId: String(req.user._id),
    scope: "customer",
  });
  if (!credential) return null;
  const result = await verifyAuthenticationResponse({
    response: approval.response,
    expectedChallenge: consumed.challenge,
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
  if (!result.verified) return null;
  const updated = await store.Credential.updateOne(
    { _id: credential._id, counter: credential.counter },
    { $set: { counter: result.authenticationInfo.newCounter } },
  );
  if (!updated.matchedCount) return null;
  await auditEvent({
    source: "server",
    action: "account.payment.passkey_authorized",
    actorId: String(req.user._id),
    outcome: "success",
    severity: "high",
    detail: kind,
  });
  return { recipientAddress: getAddress(consumed.transactionRecipient) };
}
