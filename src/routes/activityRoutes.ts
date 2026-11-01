import { Router } from "express";
import { auditEvent } from "../services/securityAudit";
import { persistentLimit } from "../middleware/securityControls";
import { authenticate } from "../middleware/auth";
import { requestToken } from "../services/sessions";
const router = Router();
const paths = new Set([
  "/",
  "/login",
  "/signup",
  "/signup/business",
  "/home",
  "/settings",
  "/settings/security",
  "/crypto",
  "/receive",
  "/pay",
  "/buy",
  "/transactions",
  "/business/home",
]);
router.post(
  "/",
  persistentLimit("page-activity", 120),
  (req, res, next) =>
    requestToken(req) ? void authenticate(req, res, next) : next(),
  async (req, res) => {
    if (!paths.has(req.body?.path))
      return res.status(400).json({ success: false });
    await auditEvent({
      source: "browser",
      action: "page.opened",
      outcome: "observed",
      route: req.body.path,
      actorId: req.user ? String(req.user._id) : undefined,
      requestId: res.locals.requestId,
    });
    res.json({ success: true });
  },
);
export default router;
