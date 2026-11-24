# VIEWLY V10 — Artist Campaigns & Creator Rewards

This implementation is an independent campaign workflow using the same broadly applicable mechanics as Whop/Content Rewards (not their code or proprietary systems).

## Artist workflow

1. Log in as artist/label and publish an original song/video release (existing Viewly library).
2. Open **Artist Studio → Launch a CPM campaign**.
3. Choose the release, fill in the long brief, permitted/prohibited creative instructions, caption, hashtags, and optional Spotify track/album link.
4. Upload original **MP4/WebM**, **JPG/PNG/WebP**, **MP3/WAV** or **PDF** assets. Valid file signatures are checked server-side. Up to 16 assets and 200 MB per campaign, with per-format upload limits. Executables and unknown archives are not accepted. Campaign media is kept out of ordinary public file URLs; access follows campaign visibility and creator ownership.
5. Enter the **rate per 1,000 API-reported views**, minimum views, maximum per clip, tracking window (7–60 days), and campaign budget. Quotes include the existing 5% Viewly fee.
6. In staging click the optional one-flow **Create & test-fund for €0** button. This makes a real campaign in the database with sandbox credit, *not* a live payment. The campaign and its terms become visible to clippers.

**After funding, the reward rate, maximum per clip and original eligibility conditions cannot be quietly changed.** The artist may pause future submissions, and hide assets from future users; past evidence and existing rights are retained for disputes.

## Clipper workflow

1. Browse genuine campaign briefs, Spotify release links, media kits and requirements. Read branded-content disclosure and copyright rules.
2. Connect **their own TikTok identity** using TikTok Login Kit OAuth. The app must have approval for `user.info.basic` and `video.list`. Usernames, screenshots and pasted follower counts are *not* proof of ownership.
3. Publish the clip on TikTok using the **TikTok app/web**. Direct posting through TikTok Content Posting API would require additional explicit consent, app review and integration; Viewly does **not** silently post or delete videos.
4. Submit the full `www.tiktok.com/@user/video/<id>` link. The server asks TikTok `/v2/video/query/` under the creator's authorized account, which only returns public videos owned by that user. A new clip must have been posted after campaign activation. Videos previously submitted elsewhere in Viewly are not accepted as a second paid claim.
5. The artist reviews the post according to published rules, with a written rejection reason and documented appeals.
6. Official TikTok-reported view snapshots are recorded. Approved sandbox CPM credits accrue using a minimum view threshold, maximum per clip and remaining campaign budget, and cannot be earned twice on repeated view checks.
7. **Review hold:** after the last new credit, wait at least **72 hours** and perform a fresh ownership/availability check. Suspicious jumps, declining counts, missing posts and expired account authorization block new credits pending review. Platform administrators have MFA-protected, audited risk-hold controls.
8. **Scheduled checks:** an in-process staging watchdog checks up to 40 approved posts about every 6 hours when approved TikTok credentials are available. It is best-effort and not a substitute for a dedicated persistent job queue in production.
9. Viewly stores previous view snapshots, decisions, holds and appeals even when the post is no longer accessible. Post deletion can halt new credits; it does not automatically erase previously finalized eligible views.
10. **Sandbox money separation:** test credit amounts are non-withdrawable and cannot be transferred into genuine payment or payout ledgers. All true charges stay at €0 while the real marketplace is disabled.

## Official provider configuration required

Both official providers currently need independent developer approval and secret values. Neither connection is faked if disabled.

**TikTok:** Register an approved app on developers.tiktok.com for Login Kit + Display API, and add redirect URI exactly:

`https://viewly-web-staging.up.railway.app/connect/tiktok/callback`

Set Railway server secrets `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET`, and a random 32-byte key as **64 hexadecimal characters** in `VIEWLY_SOCIAL_TOKEN_KEY`. TikTok authorization will request `user.info.basic,video.list`. Tokens are stored with AES-256-GCM and refreshed server-side. Never put provider client secrets, tokens or encryption keys in public source.

**Spotify:** Register a Spotify Web API app and allow redirect URI:

`https://viewly-web-staging.up.railway.app/connect/spotify/callback`

Set `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET` and the same server-only encryption key. Spotify OAuth confirms a *user's Spotify account*, not their control of a Spotify for Artists page. Spotify artist/track URLs remain plain public references with no unearned ownership badge. A separately verified Spotify for Artists ownership workflow would be needed to make such a claim.

## Scope boundaries and production blockers

- No live deposits, card charges, PayPal/Stripe payments, payouts or settlement of cash; these require provider/KYC/contract/legal setup, verified payment webhooks, anti-fraud and reserve/chargeback handling.
- API-reported view_count is **not** independent anti-bot verification. Suspicious stats may require manual decisions or an approved anti-fraud partner.
- No TikTok account may be linked without **live official OAuth approval and access**. For testing without credentials, the actual submission/payment process fails closed rather than pretending ownership was verified.
- Legal use of copyrighted music/assets and promotional disclosure require authorization by the artist and the clipper. TikTok may require branded content disclosure for paid promotions.
- Automatic TikTok posts and removal of creators' TikTok videos are not implemented; creators maintain control of their TikTok accounts.
- Persistent Railway storage was previously **staged**, but not actually attached or backed up. It may have ongoing costs, and migrating current staging data safely is required before commercial use.
- Separate owner/admin account provisioning with verified identity and MFA remains a necessary manual privileged operation.

## Quality assurance

`npm test` exercises account permissions, upload media validation, artist campaign creation, Spotify link labeling, official OAuth fail-closed handling, currency/CPM calculations, test funding, review holds, zero cash payouts and public visibility. No fabricated social metrics are injected into the live service.
