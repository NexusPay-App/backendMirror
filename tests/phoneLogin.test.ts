jest.mock("../src/services/verificationChallenges", () => ({
  consumeChallenge: jest.fn(),
  issueChallenge: jest.fn(),
  isChallengeCooldown: () => false,
}));
jest.mock("../src/services/auth", () => ({}));
jest.mock("../src/middleware/strictAuthMiddleware", () => ({
  registerVerifiedSession: jest.fn(),
  invalidateSession: jest.fn(),
}));
jest.mock("../src/services/email", () => ({
  verifyOTP: jest.fn(),
  sendEmail: jest.fn(),
}));
jest.mock("../src/services/googleAuth", () => ({}));
jest.mock("../src/services/smsService", () => ({
  SMSService: { sendOTP: jest.fn() },
}));
jest.mock("../src/services/userOptimizationService", () => ({}));
jest.mock("../src/config/env", () => ({
  __esModule: true,
  default: { JWT_SECRET: "fixture-only" },
}));
jest.mock("../src/models/models", () => ({ User: { findOne: jest.fn() } }));
jest.mock("bcrypt", () => ({ compare: jest.fn() }));
import bcrypt from "bcrypt";
import { login, verifyLogin } from "../src/controllers/authController";
import { User } from "../src/models/models";
import { SMSService } from "../src/services/smsService";
import {
  consumeChallenge,
  issueChallenge,
} from "../src/services/verificationChallenges";
import { registerVerifiedSession } from "../src/middleware/strictAuthMiddleware";
const phoneNumber = "+254700000001";
function response() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  } as any;
}
beforeEach(() => {
  (User.findOne as jest.Mock).mockResolvedValue({
    _id: "fixture-user",
    phoneNumber,
    password: "hashed",
    isPhoneVerified: true,
    status: "active",
    save: jest.fn(),
  });
  (bcrypt.compare as jest.Mock).mockResolvedValue(true);
  (SMSService.sendOTP as jest.Mock).mockResolvedValue(true);
  (consumeChallenge as jest.Mock).mockResolvedValue({});
});
test("SMS delivery failure is not reported as a sent code", async () => {
  (SMSService.sendOTP as jest.Mock).mockResolvedValue(false);
  const res = response();
  await login({ body: { phoneNumber, password: "fixture" } } as any, res);
  expect(res.status).toHaveBeenCalledWith(503);
  expect(res.json.mock.calls[0][0].success).toBe(false);
});
test("wrong password does not issue a challenge or send SMS", async () => {
  (bcrypt.compare as jest.Mock).mockResolvedValue(false);
  const res = response();
  await login({ body: { phoneNumber, password: "wrong" } } as any, res);
  expect(res.status).toHaveBeenCalledWith(401);
  expect(issueChallenge).not.toHaveBeenCalled();
  expect(SMSService.sendOTP).not.toHaveBeenCalled();
});
test("successful phone sign-in requires the single-use challenge before issuing a token", async () => {
  const res = response();
  await verifyLogin({ body: { phoneNumber, otp: "123456" } } as any, res);
  expect(consumeChallenge).toHaveBeenCalledWith(
    phoneNumber,
    "phone-login",
    "123456",
  );
  expect(res.json.mock.calls[0][0].data.token).toEqual(expect.any(String));
  expect(registerVerifiedSession).toHaveBeenCalledTimes(1);
});
test("a suspended account cannot finish sign-in using an older code", async () => {
  (User.findOne as jest.Mock).mockResolvedValue({ status: "suspended" });
  const res = response();
  await verifyLogin({ body: { phoneNumber, otp: "123456" } } as any, res);
  expect(res.status).toHaveBeenCalledWith(401);
  expect(registerVerifiedSession).not.toHaveBeenCalled();
});
