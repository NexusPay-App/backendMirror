import { mpesaCapabilities } from "../src/services/mpesaReadiness";
const original = { ...process.env };
beforeEach(() => {
  process.env.NODE_ENV = "production";
  process.env.PROD_PLATFORM_WALLET_ADDRESS =
    "0x1111111111111111111111111111111111111111";
  process.env.PROD_PLATFORM_WALLET_PRIVATE_KEY = "fixture-only";
  process.env.ENABLE_MPESA = "true";
  process.env.MPESA_SETTLEMENT_READY = "true";
  process.env.MPESA_SETTLEMENT_CHAINS = "base,arbitrum,botchain";
  process.env.MPESA_CALLBACK_SHARED_TOKEN = "fixture-only";
  for (const name of [
    "CONSUMER_KEY",
    "CONSUMER_SECRET",
    "SHORTCODE",
    "PASSKEY",
    "B2C_SHORTCODE",
    "INITIATOR_NAME",
    "SECURITY_CREDENTIAL",
  ])
    process.env["MPESA_PROD_" + name] = "fixture";
  for (const name of [
    "MPESA_STK_CALLBACK_URL",
    "MPESA_B2C_RESULT_URL",
    "MPESA_B2C_TIMEOUT_URL",
    "MPESA_B2B_RESULT_URL",
    "MPESA_B2B_TIMEOUT_URL",
  ])
    process.env[name] =
      "https://backend.example/callback?callbackToken=fixture-only";
});
afterEach(() => {
  process.env = { ...original };
});
test("requires explicit settlement verification, not just provider keys", () => {
  delete process.env.MPESA_SETTLEMENT_READY;
  expect(mpesaCapabilities().modes).toEqual({
    buy: false,
    withdraw: false,
    bills: false,
  });
});
test("requires secure provider callbacks bound to the configured secret", () => {
  process.env.MPESA_STK_CALLBACK_URL = "http://localhost:8000/callback";
  expect(mpesaCapabilities().modes.buy).toBe(false);
  process.env.MPESA_STK_CALLBACK_URL =
    "https://backend.example/callback?callbackToken=wrong";
  expect(mpesaCapabilities().modes.buy).toBe(false);
});
test("production payouts cannot fall back to sandbox credentials", () => {
  delete process.env.MPESA_PROD_SECURITY_CREDENTIAL;
  process.env.MPESA_DEV_SECURITY_CREDENTIAL = "fixture";
  expect(mpesaCapabilities().modes).toEqual({
    buy: true,
    withdraw: false,
    bills: false,
  });
});
test("only exposes provisioned USDC settlement networks", () => {
  expect(mpesaCapabilities().networks).toEqual([
    { id: "base", name: "Base", tokens: ["USDC"] },
    { id: "arbitrum", name: "Arbitrum", tokens: ["USDC"] },
  ]);
});

test("production settlement requires its own treasury", () => {
  delete process.env.PROD_PLATFORM_WALLET_PRIVATE_KEY;
  process.env.DEV_PLATFORM_WALLET_PRIVATE_KEY = "fixture-only";
  expect(mpesaCapabilities().modes.buy).toBe(false);
});
