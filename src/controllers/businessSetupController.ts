import { createHash, randomInt } from "node:crypto";
import { Request, Response } from "express";
import bcrypt from "bcrypt";
import { isValidObjectId } from "mongoose";
import { Business } from "../models/businessModel";
import { VerifiedSession } from "../models/verifiedSession";
import { createAccount, generateOTP } from "../services/auth";
import { SMSService } from "../services/smsService";
import {
  consumeChallenge,
  issueChallenge,
} from "../services/verificationChallenges";
import { registerVerifiedSession } from "../middleware/strictAuthMiddleware";

const phonePattern = /^\+[1-9]\d{7,14}$/;
const requestPattern =
  /^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i;
const validPin = (value: unknown): value is string =>
  typeof value === "string" && /^\d{6}$/.test(value);
const setupId = (owner: string, requestId: string) =>
  createHash("sha256")
    .update(`${owner}:${requestId}`)
    .digest("hex")
    .slice(0, 24);

function businessProfile(business: any) {
  return {
    businessId: String(business._id),
    businessName: business.businessName,
    merchantId: business.merchantId,
    walletAddress: business.walletAddress,
    businessType: business.businessType,
    phoneNumber: business.phoneNumber,
    creditLimit: business.creditLimit ?? 0,
    availableCredit: business.availableCredit ?? 0,
    overdraftEnabled: business.overdraftEnabled ?? false,
    isVerified: business.isVerified ?? false,
    pinSet: Boolean(business.pinSetAt),
    createdAt: business.createdAt,
  };
}

async function openBusiness(req: Request, res: Response, business: any) {
  await registerVerifiedSession(
    req.headers.authorization!.slice(7),
    String(req.user._id),
  );
  const now = new Date();
  return res.json({
    success: true,
    message: "Your business account is ready",
    data: {
      business: businessProfile(business),
      session: {
        verified: true,
        verifiedAt: now.toISOString(),
        expiresAt: new Date(now.getTime() + 30 * 60_000).toISOString(),
        businessId: String(business._id),
        businessName: business.businessName,
        merchantId: business.merchantId,
      },
    },
  });
}

async function checkPin(businessId: string, owner: string, pin: string) {
  const now = new Date();
  const business = await Business.findOneAndUpdate(
    {
      _id: businessId,
      userId: owner,
      pinHash: { $exists: true },
      $or: [
        { pinAttempts: { $lt: 5 } },
        { pinAttemptResetAt: { $lte: now } },
        { pinAttemptResetAt: { $exists: false } },
      ],
    },
    [
      {
        $set: {
          pinAttempts: {
            $cond: [
              { $gt: ["$pinAttemptResetAt", now] },
              { $add: [{ $ifNull: ["$pinAttempts", 0] }, 1] },
              1,
            ],
          },
          pinAttemptResetAt: {
            $cond: [
              { $gt: ["$pinAttemptResetAt", now] },
              "$pinAttemptResetAt",
              new Date(now.getTime() + 15 * 60_000),
            ],
          },
        },
      },
    ],
    { returnDocument: "after", updatePipeline: true },
  ).select("+pinHash");
  if (!business || !(await bcrypt.compare(pin, business.pinHash))) return null;
  await Business.updateOne(
    { _id: business._id, userId: owner, pinHash: business.pinHash },
    { $set: { pinAttempts: 0 }, $unset: { pinAttemptResetAt: 1 } },
  );
  return business;
}

export async function requestBusinessCreation(req: Request, res: Response) {
  const owner = String(req.user._id);
  const {
    requestId,
    businessName,
    ownerName,
    location,
    businessType,
    phoneNumber,
  } = req.body ?? {};
  const details: Record<string, string> = {};
  for (const [key, value] of Object.entries({
    businessName,
    ownerName,
    location,
    businessType,
  })) {
    if (
      typeof value !== "string" ||
      value.trim().length < 2 ||
      value.trim().length > 120 ||
      /[\u0000-\u001f]/.test(value)
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Complete your business details using 2–120 characters per field.",
      });
    }
    details[key] = value.trim();
  }
  if (
    typeof requestId !== "string" ||
    !requestPattern.test(requestId) ||
    typeof phoneNumber !== "string" ||
    !phonePattern.test(phoneNumber)
  ) {
    return res.status(400).json({
      success: false,
      message: "Enter a valid phone number with its country code.",
    });
  }
  if (req.body.userId && String(req.body.userId) !== owner)
    return res.status(403).json({
      success: false,
      message: "Business owner must match your signed-in account.",
    });
  const existing = await Business.exists({
    businessName: details.businessName,
  });
  if (existing)
    return res.status(409).json({
      success: false,
      message:
        "This business name is already in use. Choose another name or open your existing business.",
    });
  const otp = generateOTP();
  await issueChallenge(owner, "business-creation", otp, {
    ...details,
    phoneNumber,
    userId: owner,
    requestId,
  });
  if (!(await SMSService.sendOTP(phoneNumber, otp, "business_creation"))) {
    return res.status(503).json({
      success: false,
      message:
        "We could not deliver your code. Check your number and try again in one minute.",
    });
  }
  return res.json({
    success: true,
    message: "Verification code sent",
    data: { phoneNumber, retryAfter: 60, expiresIn: 300 },
  });
}

export async function completeBusinessCreation(req: Request, res: Response) {
  const owner = String(req.user._id);
  const { requestId, phoneNumber, otp, pin } = req.body ?? {};
  if (
    typeof requestId !== "string" ||
    !requestPattern.test(requestId) ||
    typeof phoneNumber !== "string" ||
    !phonePattern.test(phoneNumber) ||
    !validPin(otp) ||
    !validPin(pin)
  ) {
    return res.status(400).json({
      success: false,
      message: "Enter your six-digit verification code and six-digit PIN.",
    });
  }
  if (req.body.userId && String(req.body.userId) !== owner)
    return res.status(403).json({
      success: false,
      message: "Business owner must match your signed-in account.",
    });
  const _id = setupId(owner, requestId);
  if (await Business.exists({ _id, userId: owner })) {
    const existing = await checkPin(_id, owner, pin);
    if (!existing)
      return res.status(403).json({
        success: false,
        message:
          "Unable to open this business. Check your PIN or try again in 15 minutes.",
      });
    return openBusiness(req, res, existing);
  }
  const details = await consumeChallenge(
    owner,
    "business-creation",
    otp,
    owner,
  );
  if (
    !details ||
    details.requestId !== requestId ||
    details.phoneNumber !== phoneNumber
  ) {
    return res.status(400).json({
      success: false,
      message:
        "This code is invalid or expired. Request a new code and try again.",
    });
  }
  try {
    const [{ pk, walletAddress }, pinHash] = await Promise.all([
      createAccount(),
      bcrypt.hash(pin, 12),
    ]);
    const business = await Business.create({
      _id,
      userId: owner,
      businessName: details.businessName,
      ownerName: details.ownerName,
      location: details.location,
      businessType: details.businessType,
      phoneNumber: details.phoneNumber,
      merchantId: `NX-${randomInt(100_000_000, 1_000_000_000)}`,
      walletAddress,
      privateKey: pk,
      pinHash,
      pinSetAt: new Date(),
      pinAttempts: 0,
    });
    return await openBusiness(req, res, business);
  } catch (error: unknown) {
    const duplicate = (error as { code?: number }).code === 11000;
    return res.status(duplicate ? 409 : 503).json({
      success: false,
      message: duplicate
        ? "This business already exists. Open your business accounts to continue."
        : "Setup could not finish. Retry with the same PIN; if your code has expired, request a new one.",
    });
  }
}

export async function verifyBusinessPin(req: Request, res: Response) {
  const { businessId, pin } = req.body ?? {};
  if (
    typeof businessId !== "string" ||
    !isValidObjectId(businessId) ||
    !validPin(pin)
  )
    return res.status(400).json({
      success: false,
      message: "Enter a valid business and six-digit PIN.",
    });
  const business = await checkPin(businessId, String(req.user._id), pin);
  if (!business)
    return res.status(403).json({
      success: false,
      message:
        "Unable to verify your PIN. Check it or try again in 15 minutes.",
    });
  await registerVerifiedSession(
    req.headers.authorization!.slice(7),
    String(req.user._id),
  );
  const now = new Date();
  return res.json({
    success: true,
    data: {
      verified: true,
      verifiedAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + 30 * 60_000).toISOString(),
      businessId: String(business._id),
      businessName: business.businessName,
      merchantId: business.merchantId,
    },
  });
}

async function sendPinCode(req: Request, res: Response, reset: boolean) {
  const { merchantId } = req.body ?? {};
  if (typeof merchantId !== "string" || merchantId.length > 40)
    return res
      .status(400)
      .json({ success: false, message: "Select a business first." });
  const business = await Business.findOne({ merchantId, userId: req.user._id });
  if (!business || (!reset && business.pinSetAt))
    return res
      .status(409)
      .json({
        success: false,
        message: "PIN setup is unavailable for this business.",
      });
  const otp = generateOTP();
  await issueChallenge(
    String(business._id),
    reset ? "business-pin-reset" : "business-pin-setup",
    otp,
    { userId: String(req.user._id) },
  );
  if (
    !(await SMSService.sendOTP(business.phoneNumber, otp, "business_creation"))
  )
    return res
      .status(503)
      .json({
        success: false,
        message: "Code delivery failed. Try again in one minute.",
      });
  return res.json({
    success: true,
    data: {
      phoneNumber: business.phoneNumber,
      otpExpiry: new Date(Date.now() + 300_000).toISOString(),
    },
  });
}

async function confirmPinCode(req: Request, res: Response, reset: boolean) {
  const { merchantId, otp } = req.body ?? {};
  const pin = reset ? req.body?.newPin : req.body?.pin;
  if (
    typeof merchantId !== "string" ||
    merchantId.length > 40 ||
    !validPin(otp) ||
    !validPin(pin)
  )
    return res
      .status(400)
      .json({ success: false, message: "Enter a six-digit code and PIN." });
  const business = await Business.findOne({ merchantId, userId: req.user._id });
  if (!business || (!reset && business.pinSetAt))
    return res
      .status(409)
      .json({
        success: false,
        message: "PIN setup is unavailable for this business.",
      });
  if (
    !(await consumeChallenge(
      String(business._id),
      reset ? "business-pin-reset" : "business-pin-setup",
      otp,
      String(req.user._id),
    ))
  )
    return res
      .status(400)
      .json({ success: false, message: "Invalid or expired code." });
  const result = await Business.updateOne(
    {
      _id: business._id,
      userId: req.user._id,
      ...(!reset ? { pinSetAt: { $exists: false } } : {}),
    },
    {
      $set: {
        pinHash: await bcrypt.hash(pin, 12),
        pinSetAt: new Date(),
        pinAttempts: 0,
      },
      $unset: { pinAttemptResetAt: 1 },
    },
  );
  if (result.modifiedCount && reset)
    await VerifiedSession.deleteMany({ userId: String(req.user._id) });
  return res
    .status(result.modifiedCount ? 200 : 409)
    .json({
      success: result.modifiedCount === 1,
      message: result.modifiedCount
        ? "Business PIN saved"
        : "PIN setup could not finish. Try again.",
    });
}

export const requestBusinessPin = (req: Request, res: Response) =>
  sendPinCode(req, res, false);
export const setBusinessPin = (req: Request, res: Response) =>
  confirmPinCode(req, res, false);
export const requestBusinessPinReset = (req: Request, res: Response) =>
  sendPinCode(req, res, true);
export const resetBusinessPin = (req: Request, res: Response) =>
  confirmPinCode(req, res, true);

export async function updateBusinessPin(req: Request, res: Response) {
  const { businessId, oldPin, newPin } = req.body ?? {};
  if (
    typeof businessId !== "string" ||
    !isValidObjectId(businessId) ||
    !validPin(oldPin) ||
    !validPin(newPin)
  )
    return res
      .status(400)
      .json({
        success: false,
        message: "Enter your current PIN and a new six-digit PIN.",
      });
  const business = await checkPin(businessId, String(req.user._id), oldPin);
  if (!business)
    return res
      .status(403)
      .json({
        success: false,
        message:
          "Unable to verify your PIN. Check it or try again in 15 minutes.",
      });
  const result = await Business.updateOne(
    { _id: businessId, userId: req.user._id, pinHash: business.pinHash },
    { $set: { pinHash: await bcrypt.hash(newPin, 12), pinSetAt: new Date() } },
  );
  if (result.modifiedCount)
    await VerifiedSession.deleteMany({ userId: String(req.user._id) });
  return res
    .status(result.modifiedCount ? 200 : 409)
    .json({
      success: result.modifiedCount === 1,
      message: result.modifiedCount
        ? "Business PIN updated"
        : "Your PIN changed. Please try again.",
    });
}
