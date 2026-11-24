# VIEWLY — Commercial Launch Gate (24 November 2026)

**Status: NO-GO for public paid launch.**

A running web process and a passing unit/integration test suite are not sufficient evidence that this is safe for users' money and data. The current live Railway service is a **staging deployment**, and its environment has **no attached persistent volume**. Authentication, media, the SQLite database and session storage are currently ephemeral.

## Features that are real today

- Music video publishing and FFmpeg video clipping with limited file verification.
- Signed-in accounts, session cookies, artist / viewer roles, playlists of releases, likes, comments, follows, reports.
- Draft campaign creation, published/funded campaign gating.
- A read-only reward ledger; no actual withdrawals.
- Original Viewly mobile and desktop user interface. Video and creator actions use real data, not fabricated artist examples.
- Account metadata export, active session count and password-verified revocation of other sessions (in \`launch/readiness-v1\`, pending deployment).

## Hard launch blockers (all must be resolved, measured, and signed off)

| Area | Current status | Required release gate |
| --- | --- | --- |
| Persistence | **BLOCKED**: no Railway volume | Attach a persistent volume covering *both* DB and uploads, prove recovery through redeploy, set \`VIEWLY_REQUIRE_PERSISTENCE=true\` |
| Backups | **BLOCKED** | Scheduled encrypted off-site DB and media backups, retention policy, restore drill and owner-on-call alert |
| Money | **BLOCKED**: server hardcoded payout provider unavailable | Verified entity + payout-provider onboarding, account creation, reconciliation, chargebacks, double-entry ledger, idempotency, webhook events, refunds and fraud checks |
| Social verification | **BLOCKED** | Authorized platform/API permissions where available, confidence model for disputed reach, fraud mitigation, advertiser transparent dispute workflow |
| Legal | **BLOCKED** | Owner-supplied and legally reviewed ToS, Privacy / cookie policy, artist content license, rewards rules, GDPR controller information, tax and consumer compliance |
| Accounts | **PARTIAL** | Verified email, secure password reset, account deletion, right of access/data export, abuse and recovery procedures |
| Moderation | **PARTIAL** | Report-handling console, takedown/suspension workflow, copyright notices and appeals, audit trail and retention |
| Security | **PARTIAL** | Independent penetration test, dependency audit, CSP tightening, multi-device revocation, upload threat scan, edge rate limits, secure secret rotation |
| Observability | **BLOCKED** | Error monitoring and alerting, SLOs, privacy-safe logs, uptime checks and on-call |
| UX & accessibility | **PARTIAL** | Real-browser regression on Android/iOS/desktop, keyboard and screenreader review, complete empty/loading/error/consent states |
| Reliability | **PARTIAL** | Load/Soak tests, real media storage quotas, background clip workers, queue, safe rollouts, rollback runbook |
| Merchant readiness | **BLOCKED** | Final pricing, contract scope, ownership/IP schedule, support commitment, handover plan and buyer acceptance signoff |

**Do not flip** \`VIEWLY_PAID_MARKETPLACE_ENABLED\`, \`VIEWLY_PAYOUTS_OPERATIONAL\` or \`VIEWLY_LEGAL_REVIEW_COMPLETE\` based on appearance or tests alone. The source permanently blocks payouts until a properly implemented and audited payout provider exists.

## Proposed Railway storage rollout (requires owner's approval of any costs)

One mounted filesystem at \`/persistent\`, with environment variables:
\`\`\`
VIEWLY_PERSISTENCE_MOUNT=/persistent
VIEWLY_DATA_DIR=/persistent/db
VIEWLY_UPLOAD_DIR=/persistent/uploads
VIEWLY_REQUIRE_PERSISTENCE=true
\`\`\`
A volume mounted over an existing directory **hides files previously there**. **This is not a migration.** Existing database and media in the ephemeral container must be backed up/migrated (where possible) before switching those paths or those records will be lost. Prefer cloning to a disposable environment to test the restore first. Do not enable the strict gate until the mount is fully verified.

The \`/api/launch/readiness\` endpoint reports only the infrastructure/launch flags; it is deliberately never an assertion of commercial certification. Existing \`/api/health\` stays an operational health check for Railway.

## Proposed payments payout architecture (requires actual provider onboarding)

- Buyer pays verified campaign budget + disclosed platform fee through a compliant payment provider.
- Platform records order, provider event id, settled/held amount, net fees and chargebacks with idempotent reconciliation.
- Rewards are not transferable to withdrawable balance until genuine reviewed eligible submissions, valid funding, required safeguards and provider approvals.
- Payouts are executed only by a certified provider; every payout result and dispute must be reconciled.
- Payout failure/chargeback blocks subsequent automatic payments and escalates to manual review.

For production, do not directly equate "one pasted TikTok link" with "verified social impressions". Platforms' approved data access and permissions vary and can change.

## Cutover acceptance procedure

1. Obtain explicit owner approval for infrastructure spending, provider integrations and commercial policy.
2. Configure an isolated production environment and production domain; keep public staging separate.
3. Migrate persistent data with a verified checksum and restore test; never overwrite live user data.
4. Configure operational provider keys **only in protected environment variables**, never in GitHub.
5. Execute security, media, payments, account recovery, moderation and multi-device regression suites.
6. Run a real test campaign using provider test mode and permitted social sources. Resolve every failed state.
7. Carry out limited beta, owner review and buyer handover; verify mobile screenshots and actual transactions.
8. Only then authorize public marketing, deposits, withdrawals and promises of actual earning potential.

## Proof required for buyer Gio

Deliver a versioned and deployed codebase, buyer-facing product walkthrough, rights and design ownership list, source handover process, architecture and operational diagrams, data handling/retention details, paid-integration and hosting cost estimates, test report, known limitations, and an exact written asset/license/IP transfer agreement. Price depends on deliverables, market demand, actual traffic and demonstrable revenue, not on the amount of code written.

## Integrity pledge

No fake releases, fake campaign budgets, fake payout confirmations, fabricated social metrics, fabricated legal authorization, invented provider connectivity, or claims that a build passing alone is production ready.
