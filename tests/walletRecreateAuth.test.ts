jest.mock("../src/services/walletProvisioning", () => ({
  createVerifiedSmartWallet: jest.fn(),
}));
jest.mock("../src/models/models", () => ({
  User: { findById: jest.fn() },
}));
jest.mock("../src/models/verifiedSession", () => ({
  VerifiedSession: { create: jest.fn(), updateOne: jest.fn() },
}));
jest.mock("../src/services/securityAlerts", () => ({
  queueSecurityNotice: jest.fn(),
}));

import { ensureWalletForAuth } from "../src/services/sessions";
import { createVerifiedSmartWallet } from "../src/services/walletProvisioning";
import { User } from "../src/models/models";

const FRESH = {
  privateKey: "0xfreshkey",
  walletAddress: "0xFreshAddress0000000000000000000000000001",
  personalEoa: "0xPersonalEoa0000000000000000000000000001",
};
const OLD = "0xOldAddress00000000000000000000000000001";

function makeDoc(overrides: Record<string, unknown> = {}) {
  return {
    _id: "user-1",
    walletAddress: OLD,
    walletRecreateRequired: true,
    walletStatus: "pending",
    privateKey: undefined,
    walletAddressHistory: undefined,
    save: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  } as any;
}

// findById(...).select('+privateKey') must be chainable in these tests.
function mockFind(...docs: any[]) {
  let i = 0;
  (User.findById as jest.Mock).mockImplementation(() => {
    const doc = docs[Math.min(i++, docs.length - 1)];
    return { select: jest.fn().mockResolvedValue(doc) };
  });
}

function healthyUser() {
  return { _id: "user-1", walletAddress: OLD, walletRecreateRequired: false } as any;
}

beforeEach(() => {
  jest.clearAllMocks();
  (createVerifiedSmartWallet as jest.Mock).mockResolvedValue(FRESH);
});

test("healthy wallet is left alone (key check only)", async () => {
  const doc = makeDoc({ walletRecreateRequired: false, privateKey: "0xstoredkey" });
  mockFind(doc);
  const user = healthyUser();

  await ensureWalletForAuth(user);

  expect(User.findById).toHaveBeenCalledWith("user-1");
  expect(createVerifiedSmartWallet).not.toHaveBeenCalled();
  expect(doc.save).not.toHaveBeenCalled();
  expect(user.walletAddress).toBe(OLD);
});

test("missing wallet is provisioned without a history entry", async () => {
  const doc = makeDoc({ walletAddress: undefined, walletRecreateRequired: false, privateKey: undefined });
  mockFind(doc);
  const user = { _id: "user-1" } as any;

  await ensureWalletForAuth(user);

  expect(createVerifiedSmartWallet).toHaveBeenCalledWith("arbitrum");
  expect(doc.privateKey).toBe(FRESH.privateKey);
  expect(doc.walletAddress).toBe(FRESH.walletAddress);
  expect(doc.walletStatus).toBe("ready");
  expect(doc.walletRecreateRequired).toBe(false);
  expect(doc.walletAddressHistory).toBeUndefined();
  expect(doc.save).toHaveBeenCalledTimes(1);
  expect(user.walletAddress).toBe(FRESH.walletAddress);
});

test("provisions a fresh verified wallet and clears the flag", async () => {
  const doc = makeDoc();
  mockFind(doc);
  const user = { _id: "user-1", walletAddress: OLD, walletRecreateRequired: true } as any;

  await ensureWalletForAuth(user);

  expect(createVerifiedSmartWallet).toHaveBeenCalledWith("arbitrum");
  expect(doc.privateKey).toBe(FRESH.privateKey);
  expect(doc.walletAddress).toBe(FRESH.walletAddress);
  expect(doc.walletStatus).toBe("ready");
  expect(doc.walletRecreateRequired).toBe(false);
  expect(doc.walletAddressHistory).toEqual([
    expect.objectContaining({
      address: OLD,
      reason: "wallet-recreate-on-auth",
    }),
  ]);
  expect(doc.save).toHaveBeenCalledTimes(1);
  expect(user.walletAddress).toBe(FRESH.walletAddress);
  expect(user.walletRecreateRequired).toBe(false);
});

test("unreadable stored key is rotated with history", async () => {
  const doc = makeDoc({ walletRecreateRequired: false });
  let stored: unknown;
  Object.defineProperty(doc, "privateKey", {
    configurable: true,
    get() {
      if (stored === undefined) throw new Error("decrypt failed");
      return stored;
    },
    set(value: unknown) {
      stored = value;
    },
  });
  mockFind(doc);
  const user = healthyUser();

  await ensureWalletForAuth(user);

  expect(createVerifiedSmartWallet).toHaveBeenCalledWith("arbitrum");
  expect(doc.walletAddress).toBe(FRESH.walletAddress);
  expect(doc.walletAddressHistory).toEqual([
    expect.objectContaining({ address: OLD, reason: "wallet-unreadable-on-auth" }),
  ]);
  expect(doc.save).toHaveBeenCalledTimes(1);
  expect(user.walletAddress).toBe(FRESH.walletAddress);
});

test("discards rotation when another login already fixed the key", async () => {
  const unreadable = makeDoc({ walletRecreateRequired: false });
  Object.defineProperty(unreadable, "privateKey", {
    configurable: true,
    get() {
      throw new Error("decrypt failed");
    },
  });
  const fixed = makeDoc({ walletRecreateRequired: false, privateKey: "0xgood" });
  mockFind(unreadable, fixed);
  const user = healthyUser();

  await ensureWalletForAuth(user);

  expect(createVerifiedSmartWallet).toHaveBeenCalledWith("arbitrum");
  expect(fixed.save).not.toHaveBeenCalled();
  expect(user.walletAddress).toBe(OLD);
});

test("does not overwrite when another login already recreated the wallet", async () => {
  const doc = makeDoc({ walletRecreateRequired: false });
  mockFind(doc);
  const user = { _id: "user-1", walletAddress: OLD, walletRecreateRequired: true } as any;

  await ensureWalletForAuth(user);

  expect(doc.save).not.toHaveBeenCalled();
  expect(user.walletAddress).toBe(OLD);
});

test("provisioning failures never block authentication", async () => {
  (createVerifiedSmartWallet as jest.Mock).mockRejectedValue(new Error("rpc down"));
  const user = { _id: "user-1", walletRecreateRequired: true } as any;

  await expect(ensureWalletForAuth(user)).resolves.toBeUndefined();
  expect(User.findById).not.toHaveBeenCalled();
});

test("key-check read failures fail open", async () => {
  (User.findById as jest.Mock).mockReturnValue({ select: jest.fn().mockRejectedValue(new Error("db down")) });
  const user = healthyUser();

  await expect(ensureWalletForAuth(user)).resolves.toBeUndefined();
  expect(createVerifiedSmartWallet).not.toHaveBeenCalled();
});
