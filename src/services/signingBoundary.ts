import { privateKeyToAccount as thirdwebPrivateKeyToAccount } from "thirdweb/wallets";

export function privateKeyToAccount(
  ...args: Parameters<typeof thirdwebPrivateKeyToAccount>
) {
  if (process.env.NODE_ENV !== "test") {
    throw Object.assign(
      new Error(
        "Signing is paused until secure custody and wallet migration are verified.",
      ),
      { code: "SIGNING_MIGRATION_REQUIRED", status: 503 },
    );
  }
  return thirdwebPrivateKeyToAccount(...args);
}
