import { securityStore } from "../models/security";
import { auditEvent } from "./securityAudit";
import { SMSService } from "./smsService";
export async function queueSecurityNotice(
  user: any,
  kind: "login" | "password-reset" | "credentials-change" | "passkey-added",
  id: string,
) {
  if (!process.env.SECURITY_STORE_URL) return;
  await auditEvent({
    id: `account:${kind}:${id}`,
    source: "server",
    action: `account.${kind}`,
    actorId: String(user._id),
    outcome: "observed",
    severity: kind === "login" ? "info" : "high",
  });
  if (
    !user.isPhoneVerified ||
    typeof user.phoneNumber !== "string" ||
    !/^\+[1-9]\d{7,14}$/.test(user.phoneNumber)
  )
    return;
  const store = await securityStore();
  await store.Notice.updateOne(
    { _id: `${kind}:${id}` },
    {
      $setOnInsert: {
        userId: String(user._id),
        kind,
        phone: user.phoneNumber,
        status: "queued",
        createdAt: new Date(),
        nextAttemptAt: new Date(),
      },
    },
    { upsert: true },
  );
}
export async function deliverAccountSecurityNotice() {
  if (process.env.ENABLE_SMS !== "true") return { status: "disabled" };
  const store = await securityStore();
  // An abandoned sending lease is ambiguous, not permission to resend an SMS.
  await store.Notice.updateMany(
    { status: "sending", leaseUntil: { $lt: new Date() } },
    { $set: { status: "unknown" } },
  );
  const notice = await store.Notice.findOneAndUpdate(
    {
      status: "queued",
      nextAttemptAt: { $lte: new Date() },
      attempts: { $lt: 5 },
    },
    {
      $set: { status: "sending", leaseUntil: new Date(Date.now() + 60_000) },
      $inc: { attempts: 1 },
    },
    { returnDocument: "after", sort: { createdAt: 1 } },
  ).select("+phone");
  if (!notice) return { status: "idle" };
  const result = await SMSService.submitSecurityAlert(
    notice.phone,
    notice.kind,
  );
  const status =
    result.status === "accepted"
      ? "provider-accepted"
      : result.status === "unknown"
        ? "unknown"
        : notice.attempts >= 5
          ? "failed"
          : "queued";
  await store.Notice.updateOne(
    { _id: notice._id },
    {
      $set: {
        status,
        messageId: result.messageId,
        leaseUntil: null,
        nextAttemptAt: new Date(Date.now() + 60_000 * notice.attempts),
      },
    },
  );
  return { status };
}
export async function deliverSecurityAlert() {
  const store = await securityStore();
  const destinations = [
    process.env.SECURITY_ALERT_WEBHOOK,
    process.env.SECURITY_ALERT_FALLBACK_WEBHOOK,
  ].filter((value): value is string => !!value);
  if (!destinations.length) return { status: "unconfigured" };
  for (const address of destinations) {
    const url = new URL(address);
    if (url.protocol !== "https:" || url.username || url.password)
      throw new Error(
        "Alert destination must be HTTPS without embedded credentials",
      );
  }
  const now = new Date();
  const incident = await store.Incident.findOneAndUpdate(
    {
      status: "open",
      nextAttemptAt: { $lte: now },
      $or: [{ leaseUntil: null }, { leaseUntil: { $lte: now } }],
    },
    {
      $set: { leaseUntil: new Date(Date.now() + 60_000) },
      $inc: { attempts: 1 },
    },
    { returnDocument: "after", sort: { nextAttemptAt: 1 } },
  );
  if (!incident) return { status: "idle" };
  let delivered = false;
  for (const url of destinations) {
    try {
      const response = await fetch(url, {
        method: "POST",
        redirect: "error",
        signal: AbortSignal.timeout(10_000),
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": `${incident._id}:${incident.attempts}`,
          ...(process.env.SECURITY_ALERT_TOKEN
            ? { Authorization: `Bearer ${process.env.SECURITY_ALERT_TOKEN}` }
            : {}),
        },
        body: JSON.stringify({
          incidentId: incident._id,
          eventId: incident.eventId,
          severity: incident.severity,
          title: incident.title,
          attempt: incident.attempts,
        }),
      });
      if (response.ok) {
        delivered = true;
        break;
      }
    } catch {
      /* Persist failure and try the next configured channel. */
    }
  }
  await store.Incident.updateOne(
    { _id: incident._id },
    {
      $set: {
        delivery: delivered ? "provider-accepted" : "failed",
        leaseUntil: null,
        nextAttemptAt: new Date(
          Date.now() +
            (delivered
              ? 15 * 60_000
              : Math.min(2 ** Math.min(incident.attempts, 8) * 1000, 300_000)),
        ),
      },
    },
  );
  await auditEvent({
    source: "server",
    action: delivered ? "alert.accepted" : "alert.delivery.failed",
    outcome: delivered ? "success" : "failed",
    detail: incident._id,
  });
  return { status: delivered ? "provider-accepted" : "failed" };
}
