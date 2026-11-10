import type { Request, Response, NextFunction } from "express";
import bcrypt from "bcryptjs";
import { verifyPaymentApproval } from "../services/passkeyPaymentAuthorization";

async function hasValidPassword(req: Request) {
  return (
    typeof req.body.password === "string" &&
    !!req.user?.password &&
    (await bcrypt.compare(req.body.password, req.user.password))
  );
}

async function authorizeWithPasskey(
  req: Request,
  res: Response,
  kind: "send" | "merchant",
  network?: string,
) {
  if (!req.body.passkeyApproval) return false;
  const authorization = await verifyPaymentApproval(req, kind, network);
  if (!authorization) return false;
  res.locals.transactionRecipientAddress = authorization.recipientAddress;
  res.locals.transactionAuthorizedBy = "passkey";
  return true;
}

/** Bind every debit to the authenticated account; client-supplied identity is not authority. */
export async function authorizePayment(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const user = req.user;
  if (
    !user ||
    typeof req.body.senderAddress !== "string" ||
    req.body.senderAddress.toLowerCase() !== user.walletAddress?.toLowerCase()
  )
    return res.status(403).json({
      success: false,
      error: {
        code: "SENDER_MISMATCH",
        message: "Sender must match your authenticated wallet",
      },
    });
  const kind = res.locals?.paymentKind as "send" | "merchant" | undefined;
  if (req.body.passkeyApproval) {
    if (!kind || !(await authorizeWithPasskey(req, res, kind)))
      return res.status(401).json({
        success: false,
        error: {
          code: "PAYMENT_AUTH_INVALID",
          message:
            "Passkey approval expired or does not match this payment. Review and confirm again.",
        },
      });
  } else if (!(await hasValidPassword(req))) {
    return res.status(401).json({
      success: false,
      error: {
        code: "PAYMENT_AUTH_REQUIRED",
        message: "Confirm this payment with your password or passkey.",
      },
    });
  }
  next();
}

export async function authorizeBotPayment(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  if (req.body.passkeyApproval) {
    const kind = req.body.merchantId ? "merchant" : "send";
    if (
      !(await authorizeWithPasskey(req, res, kind, String(res.locals.network)))
    )
      return res.status(401).json({
        success: false,
        error: {
          code: "PAYMENT_AUTH_INVALID",
          message:
            "Passkey approval expired or does not match this payment. Review and confirm again.",
        },
      });
  } else if (!(await hasValidPassword(req))) {
    return res.status(401).json({
      success: false,
      error: {
        code: "PAYMENT_AUTH_REQUIRED",
        message: "Confirm this payment with your password or passkey.",
      },
    });
  }
  next();
}
