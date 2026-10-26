jest.mock("../src/models/verifiedSession", () => ({
  VerifiedSession: { deleteMany: jest.fn() },
}));
jest.mock("../src/models/businessModel", () => ({
  Business: {
    exists: jest.fn(),
    create: jest.fn(),
    findOne: jest.fn(),
    findOneAndUpdate: jest.fn(),
    updateOne: jest.fn(),
  },
}));
jest.mock("../src/services/auth", () => ({
  createAccount: jest.fn(),
  generateOTP: () => "123456",
}));
jest.mock("../src/services/smsService", () => ({
  SMSService: { sendOTP: jest.fn() },
}));
jest.mock("../src/services/verificationChallenges", () => ({
  issueChallenge: jest.fn(),
  consumeChallenge: jest.fn(),
}));
jest.mock("../src/middleware/strictAuthMiddleware", () => ({
  registerVerifiedSession: jest.fn(),
}));
import bcrypt from "bcrypt";
import { Business } from "../src/models/businessModel";
import { createAccount } from "../src/services/auth";
import { SMSService } from "../src/services/smsService";
import {
  issueChallenge,
  consumeChallenge,
} from "../src/services/verificationChallenges";
import {
  completeBusinessCreation,
  requestBusinessCreation,
  verifyBusinessPin,
  requestBusinessPin,
  setBusinessPin,
  requestBusinessPinReset,
  resetBusinessPin,
} from "../src/controllers/businessSetupController";
const owner = "111111111111111111111111";
const body = {
  requestId: "12983579-5e4c-4935-a933-5fd3e52242c2",
  businessName: "Test Studio",
  ownerName: "Test Owner",
  location: "Nairobi, Kenya",
  businessType: "Design",
  phoneNumber: "+254700000000",
};
const request = (data: Record<string, unknown> = body): any => ({
  body: data,
  user: { _id: owner },
  headers: { authorization: "Bearer fixture-token" },
});
const response = (): any => ({
  status: jest.fn().mockReturnThis(),
  json: jest.fn().mockReturnThis(),
});
beforeEach(() => {
  jest.resetAllMocks();
  (Business.exists as jest.Mock).mockResolvedValue(null);
  (SMSService.sendOTP as jest.Mock).mockResolvedValue(true);
});
test("binds normalized business details to the authenticated owner and sends one code", async () => {
  const res = response();
  await requestBusinessCreation(request(), res);
  expect(issueChallenge).toHaveBeenCalledWith(
    owner,
    "business-creation",
    "123456",
    { ...body, userId: owner },
  );
  expect(SMSService.sendOTP).toHaveBeenCalledTimes(1);
  expect(res.json).toHaveBeenCalledWith(
    expect.objectContaining({ success: true }),
  );
});
test.each([
  { ...body, userId: "other-owner" },
  { ...body, phoneNumber: { $ne: null } },
  { ...body, businessName: { $gt: "" } },
])("rejects forged ownership and query-shaped inputs", async (data) => {
  const res = response();
  await requestBusinessCreation(request(data), res);
  expect(res.status.mock.calls[0][0]).toBeGreaterThanOrEqual(400);
  expect(issueChallenge).not.toHaveBeenCalled();
  expect(SMSService.sendOTP).not.toHaveBeenCalled();
});
test("reports delivery failure without claiming a code was sent", async () => {
  (SMSService.sendOTP as jest.Mock).mockResolvedValue(false);
  const res = response();
  await requestBusinessCreation(request(), res);
  expect(res.status).toHaveBeenCalledWith(503);
  expect(res.json).toHaveBeenCalledWith(
    expect.objectContaining({ success: false }),
  );
});
test.each([
  null,
  { ...body, requestId: "another-request" },
  { ...body, phoneNumber: "+14155550000" },
])(
  "never provisions a wallet for invalid or mismatched verification",
  async (context) => {
    (consumeChallenge as jest.Mock).mockResolvedValue(context);
    const res = response();
    await completeBusinessCreation(
      request({ ...body, otp: "123456", pin: "639274" }),
      res,
    );
    expect(res.status).toHaveBeenCalledWith(400);
    expect(createAccount).not.toHaveBeenCalled();
    expect(Business.create).not.toHaveBeenCalled();
  },
);
test("uses verified details, hashes the PIN, and returns only public business data", async () => {
  (consumeChallenge as jest.Mock).mockResolvedValue({ ...body, userId: owner });
  (createAccount as jest.Mock).mockResolvedValue({
    pk: "fixture-private-key",
    walletAddress: "0x1111111111111111111111111111111111111111",
  });
  (Business.create as jest.Mock).mockImplementation(async (data) => data);
  const res = response();
  await completeBusinessCreation(
    request({
      ...body,
      businessName: "tampered",
      otp: "123456",
      pin: "639274",
    }),
    res,
  );
  const saved = (Business.create as jest.Mock).mock.calls[0][0];
  expect(saved.userId).toBe(owner);
  expect(saved.businessName).toBe(body.businessName);
  expect(await bcrypt.compare("639274", saved.pinHash)).toBe(true);
  const sent = res.json.mock.calls[0][0];
  expect(sent.success).toBe(true);
  expect(sent.data.business.pinSet).toBe(true);
  expect(sent.data.session.verified).toBe(true);
  expect(JSON.stringify(sent)).not.toMatch(
    /fixture-private-key|pinHash|639274|123456/,
  );
  expect(saved.creditLimit).toBeUndefined();
});
test("a successful setup retry opens the same wallet without consuming another code", async () => {
  (Business.exists as jest.Mock).mockResolvedValue({ _id: owner });
  const existing = {
    _id: owner,
    userId: owner,
    ...body,
    pinHash: await bcrypt.hash("639274", 4),
    pinSetAt: new Date(),
  };
  (Business.findOneAndUpdate as jest.Mock).mockReturnValue({
    select: jest.fn().mockResolvedValue(existing),
  });
  const res = response();
  await completeBusinessCreation(
    request({ ...body, otp: "123456", pin: "639274" }),
    res,
  );
  expect(consumeChallenge).not.toHaveBeenCalled();
  expect(createAccount).not.toHaveBeenCalled();
  expect(res.json).toHaveBeenCalledWith(
    expect.objectContaining({ success: true }),
  );
});
test("PIN attempts use an atomic owner-bound limit and deny exhausted attempts", async () => {
  (Business.findOneAndUpdate as jest.Mock).mockReturnValue({
    select: jest.fn().mockResolvedValue(null),
  });
  const res = response();
  await verifyBusinessPin(
    request({ businessId: "222222222222222222222222", pin: "639274" }),
    res,
  );
  expect(Business.findOneAndUpdate).toHaveBeenCalledWith(
    expect.objectContaining({
      userId: owner,
      $or: expect.arrayContaining([{ pinAttempts: { $lt: 5 } }]),
    }),
    expect.any(Array),
    expect.any(Object),
  );
  expect(res.status).toHaveBeenCalledWith(403);
});
test("existing business PIN setup cannot target another owner or overwrite an existing PIN", async () => {
  (Business.findOne as jest.Mock).mockResolvedValue({ pinSetAt: new Date() });
  const res = response();
  await requestBusinessPin(request({ merchantId: "NX-123456789" }), res);
  expect(Business.findOne).toHaveBeenCalledWith({
    merchantId: "NX-123456789",
    userId: owner,
  });
  expect(res.status).toHaveBeenCalledWith(409);
  expect(issueChallenge).not.toHaveBeenCalled();
  await setBusinessPin(
    request({ merchantId: "NX-123456789", pin: "639274", otp: "123456" }),
    res,
  );
  expect(Business.updateOne).not.toHaveBeenCalled();
});

test("PIN recovery delivers only to the owned business contact and uses a separate challenge purpose", async () => {
  (Business.findOne as jest.Mock).mockResolvedValue({
    _id: "222222222222222222222222",
    phoneNumber: body.phoneNumber,
    pinSetAt: new Date(),
  });
  const res = response();
  await requestBusinessPinReset(
    request({ merchantId: "NX-123456789", phoneNumber: "+14155550000" }),
    res,
  );
  expect(SMSService.sendOTP).toHaveBeenCalledWith(
    body.phoneNumber,
    "123456",
    "business_creation",
  );
  expect(issueChallenge).toHaveBeenCalledWith(
    "222222222222222222222222",
    "business-pin-reset",
    "123456",
    { userId: owner },
  );
});

test("PIN recovery cannot use a missing, expired, or already consumed code", async () => {
  (Business.findOne as jest.Mock).mockResolvedValue({
    _id: "222222222222222222222222",
    pinSetAt: new Date(),
  });
  (consumeChallenge as jest.Mock).mockResolvedValue(null);
  const res = response();
  await resetBusinessPin(
    request({ merchantId: "NX-123456789", otp: "123456", newPin: "639274" }),
    res,
  );
  expect(consumeChallenge).toHaveBeenCalledWith(
    "222222222222222222222222",
    "business-pin-reset",
    "123456",
    owner,
  );
  expect(res.status).toHaveBeenCalledWith(400);
  expect(Business.updateOne).not.toHaveBeenCalled();
});
