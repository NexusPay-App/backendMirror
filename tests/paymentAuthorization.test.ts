import { authorizePayment } from "../src/middleware/paymentAuthorization";
import bcrypt from "bcryptjs";
import { verifyPaymentApproval } from "../src/services/passkeyPaymentAuthorization";
jest.mock("../src/services/passkeyPaymentAuthorization", () => ({
  verifyPaymentApproval: jest.fn(),
}));
function response() {
  const res: any = {
    locals: {},
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
  return res;
}
test("rejects attempts to debit another authenticated user", async () => {
  const res = response(),
    next = jest.fn();
  await authorizePayment(
    {
      user: { walletAddress: "0xabc" },
      body: { senderAddress: "0xdef", password: "anything" },
    } as any,
    res,
    next,
  );
  expect(res.status).toHaveBeenCalledWith(403);
  expect(next).not.toHaveBeenCalled();
});
test("an arbitrary authenticator code cannot authorize a payment", async () => {
  const res = response(),
    next = jest.fn();
  await authorizePayment(
    {
      user: { walletAddress: "0xabc", password: "hashed" },
      body: { senderAddress: "0xabc", googleAuthCode: "123456" },
    } as any,
    res,
    next,
  );
  expect(res.status).toHaveBeenCalledWith(401);
  expect(next).not.toHaveBeenCalled();
});
test("accepts a matching authenticated wallet and existing bcrypt password", async () => {
  const res = response(),
    next = jest.fn();
  await authorizePayment(
    {
      user: {
        walletAddress: "0xabc",
        password: await bcrypt.hash("fixture-password", 4),
      },
      body: { senderAddress: "0xABC", password: "fixture-password" },
    } as any,
    res,
    next,
  );
  expect(next).toHaveBeenCalledTimes(1);
});
test("accepts a valid transaction-bound passkey without an account password", async () => {
  const res = response(),
    next = jest.fn();
  res.locals.paymentKind = "send";
  (verifyPaymentApproval as jest.Mock).mockResolvedValueOnce({
    recipientAddress: "0x0000000000000000000000000000000000000001",
  });
  await authorizePayment(
    {
      user: { _id: "user-1", walletAddress: "0xabc" },
      body: {
        senderAddress: "0xABC",
        passkeyApproval: {
          challengeId: "challenge-1",
          response: { id: "credential-1" },
        },
      },
    } as any,
    res,
    next,
  );
  expect(verifyPaymentApproval).toHaveBeenCalledWith(
    expect.objectContaining({
      body: expect.objectContaining({ passkeyApproval: expect.any(Object) }),
    }),
    "send",
    undefined,
  );
  expect(res.locals.transactionRecipientAddress).toBe(
    "0x0000000000000000000000000000000000000001",
  );
  expect(next).toHaveBeenCalledTimes(1);
});
test("rejects invalid or expired transaction-bound passkey approvals", async () => {
  const res = response(),
    next = jest.fn();
  res.locals.paymentKind = "send";
  (verifyPaymentApproval as jest.Mock).mockResolvedValueOnce(null);
  await authorizePayment(
    {
      user: { _id: "user-1", walletAddress: "0xabc" },
      body: {
        senderAddress: "0xABC",
        passkeyApproval: {
          challengeId: "challenge-1",
          response: { id: "credential-1" },
        },
      },
    } as any,
    res,
    next,
  );
  expect(res.status).toHaveBeenCalledWith(401);
  expect(next).not.toHaveBeenCalled();
});
