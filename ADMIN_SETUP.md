# VIEWLY V8 — Administrator & Authentication Operations

This system operates on **real database records**. The UI is not a mockup. Staging is **not** approved for sensitive production data until persistent storage, audited backups, mail delivery, and operational monitoring are in place.

## Owner account activation (privileged/offline only)

The public signup form **cannot** create an administrator. There is no public admin bootstrap endpoint and no hardcoded master password.

1. Create/sign in to a normal Viewly user account. Use a unique strong password.
2. Go to Account > Security and enable TOTP authenticator MFA. Save the recovery codes securely.
3. Independently verify that the intended owner controls the account and its email address. Avoid relying solely on a self-typed email field.
4. Run the provisioning utility **inside the trusted environment with access to the actual Viewly SQLite database**:

   node scripts/provision-admin.js --email=OWNER_EMAIL --verified-owner-identity --verified-email-ownership

5. The tool audits the role change, marks the email operator-verified and revokes sessions. Sign out, then sign in again with password/Google and the authenticator challenge.
6. On desktop use **Platform > Control center** in the sidebar. On mobile open **Creator tools > Admin control center**.

To revoke an owner role safely, an authorized operator can use the same command with --revoke, after a separate identity review. The web admin API intentionally cannot grant, edit, suspend or demote other admin accounts.

Never publish the owner's email, session cookies, MFA seed, recovery codes, or other credentials.

## Capabilities

- Real-time overview: user accounts, releases, campaigns, internal player events, clips, submissions, open reports, sessions, comments and payment orders.
- Users: inspect basic profile details, set viewer/artist/label roles, suspend/reactivate (suspension revokes valid sessions).
- Music: edit release metadata, genre, public/hidden visibility.
- Campaigns: edit briefs/platform, hide/restore visibility, inspect funding amounts without fabricating funds.
- Submissions: inspect posts and flag/clear submissions for human review; **not** a payout approval bypass.
- Reports: review and dismiss reports, take down associated release visibility.
- Comments: moderate and remove real comments.
- Payments: view real provider order records **read-only**. No refund, manual credit, charge, payout, or payment-status override.
- Site control: toggle public announcement banner, edit announcement text, set a real featured release, set public support email.
- Audit: record all changes made via Admin API, with actor and before/after metadata.

## Account recovery & email verification

The app supports one-time hashed tokens for email verification (24h) and password reset (30m), with session revocation upon password reset.

Actual email delivery requires:
- a valid RESEND_API_KEY,
- a verified VIEWLY_MAIL_FROM sending address,
- APP_URL pointing to the final public HTTPS origin.

**Do not display “sent email” success unless the delivery provider is configured and accepted the request.** MFA remains mandatory after a password reset for an MFA-enabled account. Provider configuration and verified email-domain ownership are deployment prerequisites, not simulated by the UI.

## Launch blockers

- Railway staging currently has no confirmed persistent volume or offsite backup/restore test. Database edits and admin audit records must not be considered durable until persistence is configured and proven.
- Owner provisioning must occur on the correct persistent DB volume, not on a developer's local throwaway database.
- No automated identity proofing, WAF/DDoS gateway, separate media sandbox, independent penetration test, or full incident alerting has been verified.
- Google login requires configured OAuth client credentials; email recovery requires provider credentials.
- Creator payouts, external view verification, and real-money workflows remain disabled. The admin UI cannot override payment/compliance gates.
- Protect the branch, require CI, keep access credentials outside GitHub and back up the MFA encryption key in an approved secret manager.

## Smoke tests

Run: node --test --test-concurrency=2 tests/*.test.js

These test authorization, privileged actions, suspended accounts, public moderation, audit trail, auth email feature gating, MFA, uploads, clips, and payments-disabled behavior. Tests prove expected functionality, not absence of all vulnerabilities.
