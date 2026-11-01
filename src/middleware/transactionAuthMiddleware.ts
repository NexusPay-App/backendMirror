import type { RequestHandler } from "express";
import bcrypt from "bcryptjs";
import { authenticate } from "./auth";
declare global {
  namespace Express {
    interface Request {
      transactionVerified?: boolean;
    }
  }
}
export const authenticateTransaction: RequestHandler = (req, res, next) => {
  void authenticate(req, res, () => {
    void (async () => {
      if (
        typeof req.body.password !== "string" ||
        !req.user?.password ||
        !(await bcrypt.compare(req.body.password, req.user.password))
      ) {
        return res
          .status(403)
          .json({ success: false, message: "Payment authorization required" });
      }
      req.transactionVerified = true;
      next();
    })().catch(next);
  });
};
