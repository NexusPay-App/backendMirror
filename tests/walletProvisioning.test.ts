jest.mock("../src/services/auth", () => ({ client: { clientId: "fixture" } }));
jest.mock("../src/services/signingBoundary", () => ({
  privateKeyToAccount: jest.fn(() => ({ address: "0xPersonalEoa0000000000000000000000000001" })),
}));
jest.mock("thirdweb/wallets", () => ({ smartWallet: jest.fn() }));

import { smartWallet } from "thirdweb/wallets";
import { verifyWalletBinding, createVerifiedSmartWallet } from "../src/services/walletProvisioning";

const TARGET = "0x1111111111111111111111111111111111111111";

function mockConnect(address: string) {
  (smartWallet as jest.Mock).mockReturnValue({
    connect: jest.fn().mockResolvedValue({ address }),
  });
}

function mockFetch(result: string) {
  (global.fetch as jest.Mock) = jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ result }),
  });
}

beforeEach(() => {
  mockConnect(TARGET);
  mockFetch("0x");
});

test("verifyWalletBinding accepts a matching address", async () => {
  const result = await verifyWalletBinding("0xkey", TARGET);
  expect(result.ok).toBe(true);
  expect(result.derived).toBe(TARGET);
  expect(result.personalEoa).toBe("0xPersonalEoa0000000000000000000000000001");
});

test("verifyWalletBinding rejects a mismatched address with the derived value", async () => {
  const result = await verifyWalletBinding("0xkey", "0x2222222222222222222222222222222222222222");
  expect(result.ok).toBe(false);
  expect(result.derived).toBe(TARGET);
  expect(result.reason).toMatch(/does not match/);
});

test("verifyWalletBinding fails fast on missing inputs", async () => {
  expect((await verifyWalletBinding(undefined, TARGET)).ok).toBe(false);
  expect((await verifyWalletBinding("0xkey", undefined)).ok).toBe(false);
  expect(smartWallet).not.toHaveBeenCalled();
});

test("createVerifiedSmartWallet returns a verified fresh pair", async () => {
  const fresh = await createVerifiedSmartWallet("arbitrum");
  expect(fresh.privateKey).toMatch(/^0x[0-9a-f]{64}$/i);
  expect(fresh.walletAddress).toBe(TARGET);
  expect(fresh.personalEoa).toBe("0xPersonalEoa0000000000000000000000000001");
  expect(fetch).toHaveBeenCalledWith(
    expect.any(String),
    expect.objectContaining({
      body: expect.stringContaining("eth_getCode"),
    }),
  );
});

test("createVerifiedSmartWallet refuses an address that already has code", async () => {
  mockFetch("0x60806040");
  await expect(createVerifiedSmartWallet("arbitrum")).rejects.toThrow(
    /Verified smart wallet creation failed after retries/,
  );
});
