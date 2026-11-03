jest.mock('../src/services/sessions', () => ({ issueSession: jest.fn().mockResolvedValue('internal-fixture-token'), revokeUserSessions: jest.fn(), requestToken: jest.fn(), requestLogoutTokens: jest.fn(), clearSessionCookie: jest.fn(), invalidateSession: jest.fn() }));
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
import { login, logout, verifyLogin } from "../src/controllers/authController";
import { User } from "../src/models/models";
import { SMSService } from "../src/services/smsService";
import {
  consumeChallenge,
  issueChallenge,
} from "../src/services/verificationChallenges";
import { clearSessionCookie, issueSession, requestLogoutTokens } from '../src/services/sessions';
import { invalidateSession } from '../src/middleware/strictAuthMiddleware';
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
test("verified phone and password establish a session without an SMS challenge", async () => {
  (SMSService.sendOTP as jest.Mock).mockResolvedValue(false);
  const res = response();
  await login({ body: { phoneNumber, password: "fixture" } } as any, res);
  expect(issueSession).toHaveBeenCalledWith(expect.anything(), res, expect.objectContaining({ phoneNumber }), "password");
  expect(res.json.mock.calls[0][0].data.sessionActive).toBe(true);
  expect(SMSService.sendOTP).not.toHaveBeenCalled();
  expect(issueChallenge).not.toHaveBeenCalled();
});
test.each(["inactive", "suspended"])("%s accounts cannot sign in with a correct password", async status => {
  (User.findOne as jest.Mock).mockResolvedValue({ password: "hashed", status, isPhoneVerified: true });
  const res = response();
  await login({ body: { phoneNumber, password: "fixture" } } as any, res);
  expect(res.status).toHaveBeenCalledWith(403);
  expect(issueSession).not.toHaveBeenCalled();
});
test("a phone number must be verified before password login", async () => {
  (User.findOne as jest.Mock).mockResolvedValue({ password: "hashed", status: "active", isPhoneVerified: false });
  const res = response();
  await login({ body: { phoneNumber, password: "fixture" } } as any, res);
  expect(res.status).toHaveBeenCalledWith(401);
  expect(issueSession).not.toHaveBeenCalled();
});
test("wrong password does not issue a challenge or send SMS", async () => {
  (bcrypt.compare as jest.Mock).mockResolvedValue(false);
  const res = response();
  await login({ body: { phoneNumber, password: "wrong" } } as any, res);
  expect(res.status).toHaveBeenCalledWith(401);
  expect(issueChallenge).not.toHaveBeenCalled();
  expect(SMSService.sendOTP).not.toHaveBeenCalled();
  expect(issueSession).not.toHaveBeenCalled();
});
test("logout revokes the current cookie session and clears the cookie", async () => {
  const tokens = ["fixture-session-token", "legacy-session-token"];
  (requestLogoutTokens as jest.Mock).mockReturnValue(tokens);
  const res = response();

  await logout({} as any, res);

  expect(invalidateSession).toHaveBeenNthCalledWith(1, tokens[0]);
  expect(invalidateSession).toHaveBeenNthCalledWith(2, tokens[1]);
  expect(clearSessionCookie).toHaveBeenCalledWith(res);
  expect(res.json.mock.calls[0][0].success).toBe(true);
});
test("logout is idempotent when the session cookie is missing", async () => {
  (requestLogoutTokens as jest.Mock).mockReturnValue([]);
  const res = response();

  await logout({} as any, res);

  expect(invalidateSession).not.toHaveBeenCalled();
  expect(clearSessionCookie).toHaveBeenCalledWith(res);
  expect(res.json.mock.calls[0][0].success).toBe(true);
});
test("successful phone sign-in requires the single-use challenge before issuing a token", async () => {
  const res = response();
  await verifyLogin({ body: { phoneNumber, otp: "123456" } } as any, res);
  expect(consumeChallenge).toHaveBeenCalledWith(
    phoneNumber,
    "phone-login",
    "123456",
  );
  expect(res.json.mock.calls[0][0].data.sessionActive).toBe(true);
  expect(registerVerifiedSession).toHaveBeenCalledTimes(1);
});
test("a suspended account cannot finish sign-in using an older code", async () => {
  (User.findOne as jest.Mock).mockResolvedValue({ status: "suspended" });
  const res = response();
  await verifyLogin({ body: { phoneNumber, otp: "123456" } } as any, res);
  expect(res.status).toHaveBeenCalledWith(401);
  expect(registerVerifiedSession).not.toHaveBeenCalled();
});
