import { createHash } from "node:crypto";
import { Schema, model, models } from "mongoose";
import type { RequestHandler } from "express";
import { canonicalPayload } from "../services/paymentInbox";

const schema = new Schema(
  {
    _id: { type: String, required: true },
    userId: { type: Schema.Types.ObjectId, required: true },
    key: String,
    fingerprint: String,
    response: Schema.Types.Mixed,
    httpStatus: Number,
  },
  { timestamps: true },
);
export const RampRequest = models.RampRequest || model("RampRequest", schema);

export const protectRampRequest: RequestHandler = async (req, res, next) => {
  const key = req.get("Idempotency-Key") || "";
  if (!/^[A-Za-z0-9_-]{16,100}$/.test(key))
    return void res
      .status(400)
      .json({
        success: false,
        message:
          "A payment reference is required. Refresh the form and try again.",
      });
  const { password, googleAuthCode, ...intent } = req.body;
  const fingerprint = createHash("sha256")
    .update(req.path + ":" + canonicalPayload(intent))
    .digest("hex");
  let record;
  try {
    record = await RampRequest.create({
      _id: `${req.user._id}:${key}`,
      userId: req.user._id,
      key,
      fingerprint,
    });
  } catch (error: any) {
    if (error.code !== 11000) return next(error);
    const previous = await RampRequest.findOne({ userId: req.user._id, key });
    if (previous?.fingerprint !== fingerprint)
      return void res
        .status(409)
        .json({
          success: false,
          message: "This payment reference belongs to another request.",
        });
    if (previous?.response)
      return void res.status(previous.httpStatus).json(previous.response);
    return void res
      .status(409)
      .json({
        success: false,
        error: {
          code: "PAYMENT_PROCESSING",
          message:
            "Your payment is still being checked. Do not start another payment.",
        },
      });
  }
  const json = res.json.bind(res);
  res.json = ((body: any) => {
    const source = body?.data || {};
    const data = Object.fromEntries(
      [
        "transactionId",
        "status",
        "amount",
        "mpesaAmount",
        "cryptoAmount",
        "tokenType",
        "chain",
        "cryptoTransactionHash",
        "mpesaReceiptNumber",
      ]
        .filter((key) => source[key] !== undefined)
        .map((key) => [key, source[key]]),
    );
    const safe = {
      success: body?.success === true,
      message: body?.success === true ? body?.message : "Payment outcome needs checking. Keep your payment reference.",
      data,
      ...(body?.success !== true
        ? {
            error: {
              code: body?.error?.code,
              message:
                "Payment outcome needs checking. Keep your payment reference.",
              paymentStarted: true,
            },
          }
        : {}),
    };
    RampRequest.updateOne(
      { _id: record._id },
      { $set: { response: safe, httpStatus: res.statusCode } },
    )
      .then(() => json(safe))
      .catch(() => {
        res.status(503);
        json({
          success: false,
          message:
            "Payment outcome needs checking. Do not submit another payment.",
          error: { paymentStarted: true },
        });
      });
    return res;
  }) as typeof res.json;
  next();
};

export const getRampRequest: RequestHandler = async (req, res) => {
  const key = String(req.params.key);
  if (!/^[A-Za-z0-9_-]{16,100}$/.test(key))
    return void res
      .status(400)
      .json({ success: false, message: "Invalid payment reference." });
  const record = await RampRequest.findOne({ userId: req.user._id, key });
  if (!record)
    return void res
      .status(404)
      .json({
        success: false,
        message: "This payment reference has not been found yet.",
      });
  res.json({
    success: true,
    data: {
      payment: record.response?.data?.transactionId
        ? record.response.data
        : null,
    },
  });
};
