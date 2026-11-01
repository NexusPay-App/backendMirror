import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { User } from "../models/models";
import { VerifiedSession } from "../models/verifiedSession";
import { requestToken, sessionKey } from "../services/sessions";
declare global {
  namespace Express {
    interface Request {
      user?: any;
      authSession?: any;
    }
  }
}
export const authenticate = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const denied = () =>
    res
      .status(401)
      .json({
        success: false,
        error: { code: "AUTH_REQUIRED", message: "Sign in again to continue." },
      });
  const token = requestToken(req);
  if (!token) return denied();
  let decoded: jwt.JwtPayload;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET || "", {
      algorithms: ["HS256"],
      issuer: "nexuspay",
      audience: "nexuspay-customer",
    }) as jwt.JwtPayload;
    if (
      typeof decoded.id !== "string" ||
      !/^[a-f0-9]{24}$/i.test(decoded.id) ||
      !decoded.jti
    )
      return denied();
  } catch {
    return denied();
  }
  try {
    const [user, session] = await Promise.all([
      User.findById(decoded.id),
      VerifiedSession.findOne({
        _id: sessionKey(token),
        userId: decoded.id,
        revokedAt: null,
        expiresAt: { $gt: new Date() },
      }),
    ]);
    if (
      !user ||
      (user.status && user.status !== "active") ||
      !session ||
      decoded.sv !== (user.securityVersion || 0)
    )
      return denied();
    req.user = user;
    req.authSession = session;
    // Internal compatibility; incoming bearer headers are never authentication authority.
    req.headers.authorization = `Bearer ${token}`;
    next();
  } catch {
    res
      .status(503)
      .json({
        success: false,
        error: {
          code: "AUTH_UNAVAILABLE",
          message: "Sign-in verification is temporarily unavailable.",
        },
      });
  }
};
