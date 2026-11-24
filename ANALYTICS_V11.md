# VIEWLY V11 — REAL ANALYTICS & BUDGET CONTROL

## Purpose

The V11 creator intelligence dashboard shows only real records already stored in Viewly SQLite. There are **no seeded marketing metrics, phantom TikTok views, fake earnings or synthetic budgets** in the live code.

Open **Artist Studio → Creator Analytics** or **Creator tools → Creator analytics** on mobile. Campaign owners can also select **Analytics & Budget** from their own campaign.

## What the artist sees

- **Portfolio overview** with total campaigns, last recorded TikTok API views, funding allocated and available across the artist's campaigns, submissions awaiting review and risk flags.
- **Detailed campaign budget**: funded amount, allocated amount, unallocated amount, CPM credits pending a hold, CPM test credits finalized, other allocation types, 5% platform fee and reference checkout quote.
- **Progress bars** on the portfolio cards and in each campaign view. Different segments show allocated versus available budget without double counting pending credit.
- **Real view graph** over 7, 30 or 90 days using `cpm_view_snapshots`. The graph shows **positive change first observed on the date of an official API check**. The actual impression may have happened earlier, and days with no check are **unknown**, never presented as zero.
- **Test credits graph** based on persisted `cpm_events` and `sandbox_creator_rewards`.
- **Clipper ranking**, based on last recorded official TikTok API views (never independently fraud-certified), number of submitted posts and actual sandbox credit events.
- **Review pipeline**, with pending, approved, rejected and flagged totals; percentage of reviewed submissions approved.
- **Action alerts** from real data: >=80% budget used, no unallocated budget, pending reviews and risk flags.
- **Budget runway estimate** only if two or more days within the last seven recorded credit allocations. It is labeled as an estimate and never considered guaranteed.
- **CSV export** of recorded daily observations and nonwithdrawable test credits, clearly indicating unverified-view status. Days with no check appear blank.

## Read-only private API

`GET /api/analytics/overview?days=7|30|90`

`GET /api/analytics/campaigns/<campaign-id>?days=7|30|90`

Both endpoints require an authenticated, active artist/label/admin account. Campaign details are checked against `campaigns.owner_id`; other owners' campaigns return 404, not a leaked summary. Only GET is permitted.

## Methodology

**Reported TikTok views:** latest stored `highest_views` from `cpm_submissions` per video, summed once. This is neither independently certified human engagement nor the amount eligible for cash payout. Duplicate polling never multiplies the same views.

**Chart trend:** for each video and each UTC day with an actual API snapshot, take the maximum recorded view count that day, then subtract the greatest previous reported count for that video. Sum only positive increments across clips on that check date. Prior snapshots before the selected time range provide the baseline. A missing day has `observed_view_delta=null`, not 0. The chart makes no claim to know hourly/daily impressions where the API didn't observe them.

**Budget:** sandbox funded amount minus sandbox allocated amount. For CPM campaigns, allocated credit is divided into unsettled CPM test credit, finalized CPM test credit and any other previously allocated credit, so the segmented bar does not count it twice. This is bookkeeping for the **sandbox**, not an escrow, a bank account or a creator cash wallet.

**Freshness:** API response includes the timestamp of the most recent recorded TikTok check and a clear disclaimer if there are none.

## External prerequisites and blockers

- TikTok Login Kit + Display API developer credentials remain required to collect future official views.
- PayPal/Stripe/cards and actual payouts remain disabled; no budget visualization authorizes a charge.
- Railway staging needs a properly migrated persistent volume and tested backups for meaningful data durability. Do not stage/apply an empty volume over existing important data without migration.
- The forecast is based on prior observed credit allocations; it may not reflect future demand or platform availability.
- The V11 graphics intentionally handle empty states instead of inventing demonstration statistics.

## Quality assurance

`npm test`

The test suite includes owner-only analytics access, cross-account isolation, sandbox budget accounting, sparse daily view history, duplicate-check protection and no mutations of real payment or wallet ledgers. The Docker build checks the V10/V11 JavaScript syntax and runs all integration tests before release.
