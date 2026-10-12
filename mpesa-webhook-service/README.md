# M-Pesa callback forwarder

Requires Node 24.21.0 and npm 12.2.0. Run `npm ci` and `npm test`. Deploy the `api` directory with the existing Vercel project configuration; the Vercel CLI is not an application dependency.

Set `BACKEND_URL` to the intended backend origin (without `/api`) and `MPESA_CALLBACK_SHARED_TOKEN` to the same secret as the backend. Configure each provider callback URL with `?callbackToken=<secret>` when provider custom headers are unavailable. Treat callback URLs as secrets and redact them from access logs.

Use dedicated POST routes `/api/stk-callback`, `/api/b2c-callback`, `/api/b2b-callback`, and `/api/queue-timeout`. The generic `/api/webhook` requires `MPESA_DEFAULT_CALLBACK_ENDPOINT` set to one of those endpoint names or `callback`; payloads cannot safely identify whether a result belongs to B2B or B2C.

The forwarder authenticates requests and waits up to ten seconds for the backend's durable inbox acknowledgement. Failed delivery returns 502. Provider retries are deduplicated by the backend. There is no background forwarding after the HTTP response.

Before live use, configure `ENABLE_MPESA=true`, run a persistent backend with `RUN_PAYMENT_WORKERS=true`, and validate callback delivery, duplicate handling, payout reconciliation, and crash recovery in the provider sandbox. A successful forwarding response means the callback was persisted, not that a financial transfer succeeded.
