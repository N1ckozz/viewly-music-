# VIEWLY Security Operations Runbook

Security goal: reduce exposure and damage. No deployment is guaranteed invulnerable.

## Controls implemented in application code

- Passwords are salted and hashed with asynchronous scrypt (N=131072,r=8,p=1); older scrypt records migrate on successful login.
- Auth failures are throttled by account identifier in SQLite; a coarse per-connection limiter also exists.
- Browser API mutations require same-origin browser metadata when supplied, plus a non-simple `X-Viewly-Request` header. CORS is disabled. Signed payment webhooks are handled separately.
- HTTPS sessions use Secure, HttpOnly, SameSite=Strict cookies; new sessions expire after seven days. Users can revoke other sessions and rotate passwords.
- Optional TOTP second factor: AES-256-GCM-encrypted seeds, one-time server-side login challenges, replay prevention, hashed single-use recovery codes. TOTP enrollment requires recent sign-in and current password for password-based accounts. If encryption key is lost, enrolled accounts will be locked until it is restored.
- Security HTTP response headers, clickjacking protection, CSP, request timeouts, bounded concurrent uploads and clipping jobs, server-side access checks and SQL bound parameters.
- User-supplied cover images are validated, decoded, resized and re-encoded to JPEG; temporary originals are deleted. Uploaded videos are inspected with ffprobe, but **are not malware-scanned or sandboxed in a separate worker**.
- Payment processing and payouts remain OFF unless their full server-side and legal prerequisites are verified. Never turn these on by environment flags alone.

## Required before accepting sensitive customer or financial data

1. **Persistent storage and encrypted backups:** current staging uses ephemeral SQLite and local media. Provision production data storage with backup/restore tests and access controls. Do not store irreplaceable files or financial information in staging.
2. **Recovery and identity:** verify email ownership, design a secure password recovery process with abuse limits, and set a documented manual recovery policy for MFA lockouts.
3. **Media isolation:** process public videos in a separately sandboxed, resource-limited worker; malware-scan and re-encode untrusted source content, and host public user media on a dedicated origin.
4. **Edge protection:** add WAF, DDoS mitigation, distributed rate limits and bot controls in front of the service. In-memory request throttling is not an adequate substitute at scale.
5. **Secrets management:** keep `VIEWLY_MFA_MASTER_KEY` (64 hex chars, 32 random bytes) out of GitHub, logs, client responses and screenshots. Back it up in a secure secret manager. Never rotate without re-encrypting all enrolled MFA seeds. Use managed vault/service credentials with least privilege.
6. **Monitoring and response:** configure security and payment alerts, central logs without credentials, incident contacts, documented breach response, periodic restore drills and independent penetration testing.
7. **Payments:** require verified Stripe webhook signatures, complete Connect onboarding/capability checks, reconciled ledgers, approved refunds/disputes and legal review before accepting creator funds or enabling cash-outs.
8. **Software supply chain:** restrict GitHub/Railway administrative access using MFA or passkeys, protect default branches with required reviews and CI, use dependency scanning and patch base images regularly.

## Deployment safety

- Run `node --test tests/*.test.js` and syntax checks before deploying.
- Confirm the **actual commit hash** deployed by Railway. Variable-only redeploys may otherwise pick up an outdated default branch if the service source/branch was not persisted correctly.
- Validate `GET /api/health` and security headers after rollout; never claim a release is safe merely because a build succeeded.
- Never paste session cookies, passwords, MFA recovery codes or master keys into support chats, issue trackers or client-side logs.

## Disclosure

Please report vulnerabilities privately to the project maintainers through a secure channel. Do not include exploit details or sensitive customer information in public GitHub issues.
