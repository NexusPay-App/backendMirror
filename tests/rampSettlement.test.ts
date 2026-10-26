jest.mock("../src/models/user", () => ({ User: { findById: jest.fn() } }));
jest.mock("../src/models/businessModel", () => ({}));
jest.mock("../src/models/escrow", () => ({
  Escrow: Object.assign(
    jest
      .fn()
      .mockImplementation((input) => ({
        ...input,
        _id: "escrow-1",
        save: jest.fn().mockResolvedValue(undefined),
      })),
    { findOne: jest.fn() },
  ),
}));
jest.mock("../src/services/mpesa", () => ({
  initiateB2C: jest.fn(),
  initiateSTKPush: jest.fn(),
  initiateB2BPaybill: jest.fn(),
  initiateB2BBuyGoods: jest.fn(),
}));
jest.mock("../src/config/env", () => ({
  __esModule: true,
  default: { arbitrum: { chainId: 42161 } },
}));
jest.mock("../src/services/token", () => ({}));
jest.mock("../src/services/platformWallet", () => ({
  initializePlatformWallets: jest.fn(),
  sendTokenFromUser: jest.fn(),
  sendFromPlatformWallet: jest.fn(),
}));
jest.mock("thirdweb", () => ({
  defineChain: jest.fn(),
  getContract: jest.fn(),
}));
jest.mock("thirdweb/extensions/erc20", () => ({ balanceOf: jest.fn() }));
jest.mock("thirdweb/wallets", () => ({}));
jest.mock("../src/services/auth", () => ({ client: { clientId: "fixture" } }));
jest.mock("../src/services/transactionLogger", () => ({
  recordTransaction: jest.fn(),
}));
jest.mock("../src/services/redis", () => ({ getRedisClient: jest.fn() }));
jest.mock("../src/config/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));
jest.mock("../src/services/mpesaUtils", () => ({}));
jest.mock("../src/services/rates", () => ({
  getConversionRateWithCaching: jest.fn().mockResolvedValue(100),
}));
jest.mock("../src/services/smsService", () => ({
  SMSService: { sendSecurityAlert: jest.fn() },
}));
import {
  payWithCrypto,
  mpesaB2BWebhook,
} from "../src/controllers/mpesaController";
import {
  initiateB2C,
  initiateB2BPaybill,
  initiateB2BBuyGoods,
} from "../src/services/mpesa";
import {
  initializePlatformWallets,
  sendTokenFromUser,
  sendFromPlatformWallet,
} from "../src/services/platformWallet";
import { balanceOf } from "thirdweb/extensions/erc20";
import { Escrow } from "../src/models/escrow";
function response() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  } as any;
}
const body = {
  amount: 100,
  cryptoAmount: 1,
  chain: "arbitrum",
  tokenType: "USDC",
  targetType: "till",
  targetNumber: "123456",
};
const user = {
  _id: "user-1",
  walletAddress: "0x1111111111111111111111111111111111111111",
  privateKey: "fixture-only",
  phoneNumber: "+254700000001",
};
beforeEach(() => {
  (initializePlatformWallets as jest.Mock).mockResolvedValue({
    main: { address: "0x2222222222222222222222222222222222222222" },
  });
  (sendTokenFromUser as jest.Mock).mockResolvedValue({
    transactionHash: "0xreceipt",
  });
  (balanceOf as jest.Mock).mockResolvedValue(10000000n);
  for (const method of [initiateB2BPaybill, initiateB2BBuyGoods])
    (method as jest.Mock).mockResolvedValue({
      ResponseCode: "0",
      ConversationID: "provider-reference",
    });
});
test("till payments go to BusinessBuyGoods and remain processing until a callback", async () => {
  const res = response();
  await payWithCrypto({ body, user } as any, res, jest.fn());
  expect(initiateB2BBuyGoods).toHaveBeenCalledWith(100, "123456");
  expect(initiateB2C).not.toHaveBeenCalled();
  expect(res.json.mock.calls[0][0].data.status).toBe("processing");
});
test("paybill payments preserve the account reference", async () => {
  const res = response();
  await payWithCrypto(
    {
      body: { ...body, targetType: "paybill", accountNumber: "INV-1" },
      user,
    } as any,
    res,
    jest.fn(),
  );
  expect(initiateB2BPaybill).toHaveBeenCalledWith(100, "123456", "INV-1");
  expect(res.json.mock.calls[0][0].data.status).toBe("processing");
});
test("an unconfirmed provider outcome is held for review without another payout or automatic refund", async () => {
  (initiateB2BBuyGoods as jest.Mock).mockRejectedValue(new Error("timeout"));
  const res = response();
  await payWithCrypto({ body, user } as any, res, jest.fn());
  expect(res.status).toHaveBeenCalledWith(202);
  expect(res.json.mock.calls[0][0].data.status).toBe("error");
  expect(sendFromPlatformWallet).not.toHaveBeenCalled();
});
test("token balances use decimals before comparing the available amount", async () => {
  (balanceOf as jest.Mock).mockResolvedValue(500000n);
  const res = response();
  await payWithCrypto({ body, user } as any, res, jest.fn());
  expect(res.status).toHaveBeenCalledWith(400);
  expect(sendTokenFromUser).not.toHaveBeenCalled();
});
test("the durable callback handler waits for settlement processing before completing", async () => {
  let release!: () => void;
  const save = jest.fn(
    () =>
      new Promise<void>((resolve) => {
        release = resolve;
      }),
  );
  (Escrow.findOne as jest.Mock).mockResolvedValue({
    transactionId: "tx-1",
    userId: "user-1",
    amount: 100,
    metadata: {},
    save,
  });
  const res = response();
  const work = mpesaB2BWebhook(
    {
      body: { Result: { ConversationID: "provider-reference", ResultCode: 0 } },
    } as any,
    res,
  );
  await new Promise((resolve) => setImmediate(resolve));
  expect(res.json).not.toHaveBeenCalled();
  release();
  await work;
  expect(res.json).toHaveBeenCalledTimes(1);
});
