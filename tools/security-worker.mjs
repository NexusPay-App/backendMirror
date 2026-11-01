import { readFile } from "node:fs/promises";
import mongoose from "mongoose";
import { monitorChain, readOnlyRpc } from "../dist/services/securityMonitor.js";
import {
  deliverSecurityAlert,
  deliverAccountSecurityNotice,
} from "../dist/services/securityAlerts.js";
import { closeSecurityStore } from "../dist/models/security.js";
import { auditEvent } from "../dist/services/securityAudit.js";
if (process.env.LOAD_LOCAL_ENV !== "false")
  throw new Error(
    "Set LOAD_LOCAL_ENV=false and supply a dedicated read-only database credential explicitly.",
  );
if (!process.env.SECURITY_MONITOR_CONFIG || !process.env.MONITOR_DATABASE_URL)
  throw new Error(
    "Monitor config file and read-only database connection are required.",
  );
const config = JSON.parse(
  await readFile(process.env.SECURITY_MONITOR_CONFIG, "utf8"),
);
await mongoose.connect(process.env.MONITOR_DATABASE_URL, { autoIndex: false });
try {
  for (const chain of config.chains) {
    try {
      const rpcUrl = process.env[chain.rpcVariable];
      if (!rpcUrl) throw new Error("Monitoring RPC missing");
      await monitorChain({ ...chain, rpc: readOnlyRpc(rpcUrl) });
    } catch {
      process.exitCode = 1;
      console.error("SECURITY_MONITOR_CHAIN_FAILED", {
        chainId: chain.chainId,
      });
      try {
        await auditEvent({
          id: `monitor-failure:${chain.chainId}:${Math.floor(Date.now() / 3600_000)}`,
          source: "server",
          action: "monitor.chain.failed",
          outcome: "failed",
          severity: "critical",
          chainId: chain.chainId,
        });
      } catch {
        console.error("SECURITY_MONITOR_AUDIT_UNAVAILABLE");
      }
    }
  }
  for (const deliver of [deliverSecurityAlert, deliverAccountSecurityNotice]) {
    try {
      await deliver();
    } catch {
      process.exitCode = 1;
      console.error("SECURITY_NOTIFICATION_WORKER_FAILED");
    }
  }
} finally {
  await mongoose.disconnect();
  await closeSecurityStore();
}
