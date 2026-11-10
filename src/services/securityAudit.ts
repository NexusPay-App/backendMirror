import { randomUUID, createHmac } from "node:crypto";
import type { RequestHandler } from "express";
import { securityStore } from "../models/security";

export type SecurityEvent = {
  id?: string;
  source: "server" | "browser" | "chain" | "operator";
  action: string;
  outcome: "success" | "denied" | "failed" | "observed";
  severity?: "info" | "high" | "critical";
  actorId?: string;
  requestId?: string;
  sessionRef?: string;
  route?: string;
  method?: string;
  status?: number;
  chainId?: number;
  wallet?: string;
  transactionHash?: string;
  intentId?: string;
  detail?: string;
  ipHash?: string;
};
const safeIdentifier = (value?: string) =>
  value && /^[a-zA-Z0-9:._/-]{1,160}$/.test(value) ? value : undefined;
export async function auditEvent(input: SecurityEvent) {
  const store = await securityStore();
  const id =
    input.id || `${Date.now().toString().padStart(13, "0")}:${randomUUID()}`;
  const event = {
    _id: id,
    version: 1,
    occurredAt: new Date(),
    source: input.source,
    action: safeIdentifier(input.action),
    outcome: input.outcome,
    severity: input.severity || "info",
    actorId: safeIdentifier(input.actorId),
    requestId: safeIdentifier(input.requestId),
    sessionRef: safeIdentifier(input.sessionRef),
    route: safeIdentifier(input.route),
    method: safeIdentifier(input.method),
    status: input.status,
    chainId: input.chainId,
    wallet: safeIdentifier(input.wallet),
    transactionHash: safeIdentifier(input.transactionHash),
    intentId: safeIdentifier(input.intentId),
    detail: safeIdentifier(input.detail),
    ipHash: safeIdentifier(input.ipHash),
    environment: process.env.NODE_ENV || "development",
    deployment: process.env.VERCEL_GIT_COMMIT_SHA || "local",
  };
  try {
    await store.Event.create(event);
  } catch (error: any) {
    if (error.code !== 11000) throw error;
  }
  if (event.severity !== "info") {
    await store.Incident.updateOne(
      { _id: id },
      {
        $setOnInsert: {
          eventId: id,
          severity: event.severity,
          title: event.action,
          status: "open",
          createdAt: new Date(),
          nextAttemptAt: new Date(),
          delivery: "queued",
        },
      },
      { upsert: true },
    );
  }
  return id;
}
export const auditRequests: RequestHandler = (req, res, next) => {
  if (
    !process.env.SECURITY_STORE_URL ||
    req.path.startsWith("/api/health") ||
    req.path.startsWith("/api/public")
  )
    return next();
  const original = res.json.bind(res);
  let intercepted = false;
  res.json = ((body: unknown) => {
    if (intercepted) return original(body);
    intercepted = true;
    const route = (
      req.baseUrl +
      (typeof req.route?.path === "string" ? req.route.path : req.path)
    )
      .replace(/[a-f0-9]{24,}/gi, ":id")
      .replace(/\+/g, "");
    const secret = process.env.RATE_LIMIT_SECRET || process.env.JWT_SECRET;
    const ipHash = secret
      ? createHmac("sha256", secret)
          .update(req.ip || "unknown")
          .digest("hex")
      : undefined;
    void auditEvent({
      source: "server",
      action: `http.${req.method.toLowerCase()}`,
      outcome:
        res.statusCode < 400
          ? "success"
          : res.statusCode < 500
            ? "denied"
            : "failed",
      actorId: req.user ? String(req.user._id) : undefined,
      requestId: res.locals.requestId,
      sessionRef: req.authSession?._id,
      route,
      method: req.method,
      status: res.statusCode,
      ipHash,
    })
      .then(async (id) => {
        const store = await securityStore();
        await store.RequestContext.create({
          _id: id,
          ip: req.ip,
          userAgent: (req.get("user-agent") || "").slice(0, 300),
          expiresAt: new Date(Date.now() + 30 * 86400_000),
        });
        return original(body);
      })
      .catch((error: any) => {
        console.error("SECURITY_AUDIT_UNAVAILABLE", {
          requestId: res.locals.requestId,
          reason: error?.name || "UnknownError",
          code: error?.code,
        });
        if (req.method === "GET") original(body);
        else {
          res.removeHeader("Set-Cookie");
          res.status(503);
          original({
            success: false,
            message:
              "Security recording unavailable. Check action status before retrying.",
          });
        }
      });
    return res;
  }) as typeof res.json;
  next();
};
