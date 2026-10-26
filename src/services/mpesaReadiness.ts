export type RampMode = "buy" | "withdraw" | "bills";
const callbackNames = [
  "MPESA_STK_CALLBACK_URL",
  "MPESA_B2C_RESULT_URL",
  "MPESA_B2C_TIMEOUT_URL",
  "MPESA_B2B_RESULT_URL",
  "MPESA_B2B_TIMEOUT_URL",
];

export function mpesaCapabilities() {
  const production = process.env.NODE_ENV === "production";
  const prefix = production ? "MPESA_PROD_" : "MPESA_DEV_";
  const credentials = [
    "CONSUMER_KEY",
    "CONSUMER_SECRET",
    "SHORTCODE",
    "PASSKEY",
  ].every((name) => !!process.env[prefix + name]);
  const payouts = [
    "B2C_SHORTCODE",
    "INITIATOR_NAME",
    "SECURITY_CREDENTIAL",
  ].every((name) => !!process.env[prefix + name]);
  const callbackSecret = process.env.MPESA_CALLBACK_SHARED_TOKEN;
  const callbacks = callbackNames.every((name) => {
    try {
      const url = new URL(process.env[name] || "");
      return (
        url.protocol === "https:" &&
        !["localhost", "127.0.0.1"].includes(url.hostname) &&
        !!callbackSecret &&
        url.searchParams.get("callbackToken") === callbackSecret
      );
    } catch {
      return false;
    }
  });
  const treasuryPrefix = production ? "PROD_" : "DEV_";
  const treasury =
    /^0x[a-fA-F0-9]{40}$/.test(
      process.env[treasuryPrefix + "PLATFORM_WALLET_ADDRESS"] || "",
    ) && !!process.env[treasuryPrefix + "PLATFORM_WALLET_PRIVATE_KEY"];
  const enabled =
    treasury &&
    process.env.ENABLE_MPESA === "true" &&
    process.env.MPESA_SETTLEMENT_READY === "true" &&
    credentials &&
    callbacks;
  const chains = (process.env.MPESA_SETTLEMENT_CHAINS || "")
    .split(",")
    .filter((chain) => ["base", "arbitrum"].includes(chain));
  const available = enabled && chains.length > 0;
  return {
    provider: "M-Pesa",
    currency: "KES",
    sandbox: !production,
    modes: {
      buy: available,
      withdraw: available && payouts,
      bills: available && payouts,
    },
    networks: chains.map((id) => ({
      id,
      name: id === "base" ? "Base" : "Arbitrum",
      tokens: ["USDC"],
    })),
    minimumKes: 10,
    maximumKes: 150000,
    message: available
      ? null
      : "M-Pesa payments are not available yet. You can still send and receive stablecoins in your wallet.",
  };
}
