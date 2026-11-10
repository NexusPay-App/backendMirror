import { privateKeyToAccount as thirdwebPrivateKeyToAccount } from "thirdweb/wallets";

const PAUSED_MESSAGE =
  "Signing is paused until secure custody and wallet migration are verified.";

/**
 * Legacy database-key signing stays off unless a deployment opts in explicitly.
 * Isolated tests remain exempt. Set LEGACY_SIGNER_ENABLED=true only on a
 * reviewed deployment that is authorized to move funds.
 */
export function legacySignerEnabled() {
  return (
    process.env.NODE_ENV === "test" ||
    process.env.LEGACY_SIGNER_ENABLED === "true"
  );
}

export function privateKeyToAccount(
  ...args: Parameters<typeof thirdwebPrivateKeyToAccount>
) {
  if (!legacySignerEnabled()) {
    throw Object.assign(new Error(PAUSED_MESSAGE), {
      code: "SIGNING_MIGRATION_REQUIRED",
      status: 503,
    });
  }
  return thirdwebPrivateKeyToAccount(...args);
}
