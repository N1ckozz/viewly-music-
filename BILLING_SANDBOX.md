# VIEWLY V9 — ZERO-CHARGE BILLING SANDBOX

## What works now

The pricing page displays real reference prices with monthly and yearly options:

| Plan | Monthly | Yearly | Published releases | Clips/month | Campaign drafts |
| --- | ---: | ---: | ---: | ---: | ---: |
| Free | €0 | €0 | 3 | 10 | 2 |
| Creator | €5.00 | €50.00 | 30 | 100 | 15 |
| Creator Pro | €19.99 | €199.00 | 150 | 500 | 80 |
| Studio | €49.99 | €499.00 | 1,000 | 2,000 | 500 |

Only the Creator €5/month subscription was previously fixed. Higher-tier prices are editable product choices to review before any live-payment activation.

- Logged-in accounts can activate, switch, cancel and resume sandbox subscriptions.
- Subscription records, period dates, renewals, quota checks and event history use SQLite.
- Every sandbox event records exactly **0 charged cents**. Test billing events are NOT provider transactions, bank receipts or invoices.
- Actual card/PayPal/Stripe purchases remain disabled. They require approved live accounts, verified webhooks, dispute handling, consumer and tax requirements and a separate audited provider implementation.
- Automatic sandbox renewal is lazy on next authenticated access, with no real billing; cancellation disables renewal at the current period end.

## Campaign checkout simulation

A real artist creates a campaign draft with a standard reward, budget and **5% platform fee**. The artist can then click **Test fund this campaign for €0**.

Example: €100 budget + €5 fee = €105 reference total, **€0 actually charged**.

- Campaign becomes `sandbox_active` and is visibly marked **TEST** in discovery.
- A second account can submit a public social video link.
- The artist can review the submitted post; an approval produces a sandbox reward.
- Sandbox funding and creator rewards live in **separate database tables**. They do not create real Stripe orders, paid campaign balances, withdrawable amounts, or wallet ledger transactions.
- The wallet shows test credits separately, with no way to cash them out.
- There is no claim that external views, fake posts, or reach are verified.

## Environment flags

Enable **only in staging**:
- `VIEWLY_BILLING_MODE=sandbox`
- `VIEWLY_BILLING_SANDBOX_ALLOWED=true`

To disable sandbox activation, remove either setting (or set sandbox allowed to false). Existing test entitlements then stop unlocking higher limits, while all test records remain clearly marked as sandbox data.

**Do not** activate live paid campaigns or cash payouts by changing these flags. The genuine payment launch gate remains disabled until audited provider integrations and verified payouts are available.

## Activation and security

- Admin account provisioning still requires verified owner identity, email ownership and authenticator MFA. It cannot be performed by a public sign-up.
- Email verification and reset delivery require real mail-provider credentials. Google OAuth requires its own verified client credentials.
- Database persistence is **not verified** until Railway volume attachment, current-data migration, automatic encrypted backups and restore testing. Do not upload irreplaceable content while staging uses ephemeral storage.
- The Railway storage volume is usage-billed; do not apply an empty volume atop existing data without a backup/migration plan.
- The alternative permanent Viewly access after 10,000 verified promotional views is not automatically enabled because no reliable external-view verification is connected.

## Testing

`npm test`

The integration suite covers no-charge subscription activation, annual plans, quota enforcement, cancellation/resume and the full campaign sandbox reward lifecycle, including assertions that the real payment and wallet tables remain unchanged.
