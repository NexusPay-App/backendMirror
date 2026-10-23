# Product domain: app.nexuspayapp.xyz

The frontend hostname is attached to Vercel project `nexuspayapp` in `susan-s-projects-2b37acc3`. DNS and ownership verification are pending as of 23 October 2026. The existing `https://nexuspayapp-ten.vercel.app` URL remains available.

At the DNS provider for `nexuspayapp.xyz` (current nameservers: Cloudoon), add:

| Type | Host | Value |
| --- | --- | --- |
| CNAME | app | c952c1e58a9b65e3.vercel-dns-017.com |
| TXT | _vercel | vc-domain-verify=app.nexuspayapp.xyz,f0a48e9332835782948a |

These values were returned by Vercel for this project. The TXT challenge is required because the hostname was associated with a different Vercel project. Do not replace root-domain or email records. If an `app` A/AAAA/CNAME record exists, update that hostname so it has the required CNAME without conflicting records.

The backend uses `APP_ORIGIN=https://app.nexuspayapp.xyz` in production, in addition to the existing `ALLOWED_ORIGINS`. This preserves existing application and local origins without exporting or overwriting sensitive Vercel environment values. API traffic continues through the frontend's `/api` rewrite to the existing backend.

Google Identity Services uses a JavaScript credential callback in this app. In the existing Google OAuth web client, add `https://app.nexuspayapp.xyz` to **Authorized JavaScript origins**, keeping the current origins. A new `/auth/callback` URL is not used by this flow. The Google project owner must make this change and test a real login.

After the DNS records are saved:

1. Run `vercel domains verify app.nexuspayapp.xyz` from `nexuspayapp` and confirm project verification and DNS configuration pass.
2. Check HTTPS, `/onboarding`, `/ecosystem`, and `/api/health/ready` on the custom hostname.
3. Confirm POST preflight responses allow exactly `https://app.nexuspayapp.xyz`, and complete a real Google/phone login.

Users will sign in again on the new hostname because browser session storage is scoped to the origin. Wallet addresses and backend accounts stay unchanged.
