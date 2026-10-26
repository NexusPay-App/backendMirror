jest.mock("../src/services/paymentInbox", () => ({
  canonicalPayload: (body: unknown) => JSON.stringify(body),
}));
import express from "express";
import request from "supertest";
import {
  RampRequest,
  protectRampRequest,
  getRampRequest,
} from "../src/middleware/rampRequest";
const key = "payment-reference-123";
let records: Map<string, any>;
let calls: number;
const app = express()
  .use(express.json())
  .use((req: any, _res, next) => {
    req.user = { _id: "111111111111111111111111" };
    next();
  });
app.get("/requests/:key", getRampRequest);
app.post("/pay", protectRampRequest, async (req, res) => {
  calls++;
  await new Promise((resolve) => setTimeout(resolve, 20));
  if (req.body.fail)
    return res.status(400).json({ success: false, message: "Outcome unknown" });
  return res.json({
    success: true,
    data: {
      transactionId: "tx-1",
      status: "processing",
      password: "must-never-persist",
      providerSecret: "must-never-persist",
    },
  });
});
beforeEach(() => {
  records = new Map();
  calls = 0;
  jest.spyOn(RampRequest, "create").mockImplementation((async (input: any) => {
    if (records.has(input.key))
      throw Object.assign(new Error("duplicate"), { code: 11000 });
    const record = { ...input, _id: input.key };
    records.set(input.key, record);
    return record;
  }) as any);
  jest
    .spyOn(RampRequest, "findOne")
    .mockImplementation((async (query: any) => records.get(query.key)) as any);
  jest.spyOn(RampRequest, "updateOne").mockImplementation((async (
    query: any,
    update: any,
  ) => {
    Object.assign(records.get(query._id), update.$set);
    return { modifiedCount: 1 };
  }) as any);
});
afterEach(() => jest.restoreAllMocks());
test("concurrent delivery cannot initiate the same payment twice", async () => {
  const responses = await Promise.all(
    [1, 2].map(() =>
      request(app)
        .post("/pay")
        .set("Idempotency-Key", key)
        .send({ amount: 100 }),
    ),
  );
  expect(responses.map((response) => response.status).sort()).toEqual([
    200, 409,
  ]);
  expect(calls).toBe(1);
});
test("replay returns saved outcome and never saves credentials", async () => {
  await request(app)
    .post("/pay")
    .set("Idempotency-Key", key)
    .send({ amount: 100, password: "one" })
    .expect(200);
  const response = await request(app)
    .post("/pay")
    .set("Idempotency-Key", key)
    .send({ amount: 100, password: "two" })
    .expect(200);
  expect(calls).toBe(1);
  expect(response.body.data).toEqual({
    transactionId: "tx-1",
    status: "processing",
  });
  expect(JSON.stringify(records.get(key))).not.toContain("must-never-persist");
});
test("changed intent cannot reuse a payment reference", async () => {
  await request(app)
    .post("/pay")
    .set("Idempotency-Key", key)
    .send({ amount: 100 })
    .expect(200);
  await request(app)
    .post("/pay")
    .set("Idempotency-Key", key)
    .send({ amount: 200 })
    .expect(409);
  expect(calls).toBe(1);
});
test("errors after a payment starts cannot be treated as a safe retry", async () => {
  const response = await request(app)
    .post("/pay")
    .set("Idempotency-Key", key)
    .send({ amount: 100, fail: true })
    .expect(400);
  expect(response.body.error.paymentStarted).toBe(true);
});
test("missing payment reference fails before any provider call", async () => {
  await request(app).post("/pay").send({ amount: 100 }).expect(400);
  expect(calls).toBe(0);
});

test("a lost response can be recovered read-only using its authenticated payment reference", async () => {
  await request(app)
    .post("/pay")
    .set("Idempotency-Key", key)
    .send({ amount: 100 })
    .expect(200);
  const response = await request(app)
    .get("/requests/" + key)
    .expect(200);
  expect(response.body.data.payment).toEqual({
    transactionId: "tx-1",
    status: "processing",
  });
  expect(RampRequest.findOne).toHaveBeenCalledWith({
    userId: "111111111111111111111111",
    key,
  });
  expect(calls).toBe(1);
});
