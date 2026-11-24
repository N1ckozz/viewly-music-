# VIEWLY MUSIC

Independent rap, trap, drill and hip-hop promotion and clipping platform.

Public staging: https://viewly-web-staging.up.railway.app
Repository: https://github.com/N1ckozz/viewly-music-

## Implemented and real

- Email/password users, sessions and optional Google OAuth when configured.
- Artist/label and viewer/clipper roles, profiles.
- Authorized video upload with media validation; playback, signed-in unique plays, likes and comments.
- Real FFmpeg clip exports, IN/OUT timeline UI, vertical and original framing.
- Discover and release filters, sorting, real data metrics, native link sharing and direct release links.
- Artist follow/unfollow, public artist information, activity derived from database records.
- Authenticated content reports and an administrator report-review endpoint.
- Private campaign drafts with per-clip reward settings and a transparent 5% fee calculation.
- Read-only wallet ledger; no fabricated money.
- Desktop/mobile Viewly design with fast navigation, search command palette, artist studio, tabs, and reduced-motion styling.
- CI and Docker build checks for authentication, upload, clip export, security, activity, follows, reports, UI navigation.

## Not ready for public paid operations

**STAGING/BETA ONLY. NOT COMMERCIAL LAUNCH READY.**

Withdrawals and payouts are NOT implemented; payments and campaign rewards remain deliberately disabled in source. There is no guaranteed automated social view verification, complete copyright moderation, email verification, password reset, approved production payment provider, KYC/tax/legal solution or complete anti-fraud review. Do not present any of these as operational.

The backend intentionally refuses payments that are not genuinely configured and verified.

## Local startup

Node.js >= 22.13 and FFmpeg/FFprobe are required.

    npm test
    npm start

Then open http://localhost:4179 on the computer running the server.

## Real source architecture

- server.js: Node HTTP, SQLite, authentication, content, clipping, drafts, payments hard-gates, follows, reports.
- public/app.js: core API logic and actions.
- public/stage.js: content-first navigation and discovery.
- public/experience.js: interactive release sorting, workspace tabs, search, artist follow, sharing, activity, clip editor.
- public/styles.css, stage.css and experience.css: accessible responsive styles, brand design, dark visual depth.
- tests: real end-to-end backend and simulated UI interaction checks.
- Dockerfile: builds from source, checks tests before deployment.

The original ZIP remains a backup snapshot, but the live build is now source-based.

## Railway staging settings

Project: viewly-music. Environment: staging. Service: viewly-web.

    NODE_ENV=production
    APP_URL=https://viewly-web-staging.up.railway.app
    VIEWLY_PAID_MARKETPLACE_ENABLED=false
    VIEWLY_PAYOUTS_OPERATIONAL=false
    VIEWLY_LEGAL_REVIEW_COMPLETE=false
    VIEWLY_DATA_DIR=/persistent/data
    VIEWLY_UPLOAD_DIR=/persistent/uploads
    VIEWLY_REQUIRE_PERSISTENT_STORAGE=true

**Persistence:** Staging requires a Railway volume mounted at `/persistent` (initial size 500 MB). When the requirement flag is enabled, the entrypoint refuses to start unless the actual mount is present and both storage paths are inside it. Verify the volume is live before deploying. The initial switch from ephemeral storage does not migrate old data automatically. Keep independent backups of SQLite (using a consistent SQLite backup) and uploaded files; verify restoration and available capacity before accepting real users. Hosting and storage may cost money.

## Security

Do not commit provider secrets, wallet keys, real databases or passwords. Store secrets server-side. Validate user identity and role for every privileged operation. Maintain content licensing, privacy protection and moderation procedures. Complete an independent security and payment compliance review before allowing public paid campaigns.

## V12 recovery and browser checks

The private Railway bucket `viewly-backups` stores daily verified snapshots of SQLite and all referenced release, clip and campaign media. The worker runs with the application, uses SQLite's online backup API, verifies a restore in temporary storage, downloads the new object to verify its SHA-256, and keeps seven recent backups. No backup is publicly served. A backup failure is logged without exposing credentials. Set `VIEWLY_BACKUPS_ENABLED=true` and the five `VIEWLY_BACKUP_*` connection variables using Railway bucket references (never commit secrets). Storage and network usage can incur charges. This is not an immutable off-account backup and requires separate monitoring; preserve the existing MFA master key and other provider secrets securely outside the archive.

To restore, retrieve a verified archive using authorized private bucket credentials, check the SHA-256 against object metadata, and run `python3 scripts/backup.py restore snapshot.tar.gz /path/to/empty-recovery-directory`. Do not restore over live files. Stop writes and arrange an isolated deployment before switching storage; verify accounts, media, campaign records, credentials and invalidate restored sessions before reopening. Backups do not recover files lost before the volume was provisioned.

Browser and recovery CI runs actual Chromium at desktop and mobile widths against an isolated app and the staging URL. Guest screenshots are attached as short-lived CI artifacts. The browser suite tests header geometry, rail visibility and persisted preference, mobile creator tools, navigation and JavaScript errors. No real-user data is written by the smoke test.

## V13 creator hub

The `/api/workspace?days=7|30` endpoint returns exact public catalogue totals, separately counted sandbox and verified funded campaigns, UTC play history and ranked public releases. Play counts are first recorded signed-in Viewly plays per user/release, not TikTok views. The signed-in session alone determines private dashboard scope, including clipper eligibility and creator review queue/budget summaries. No cash payout is enabled. The home hub keeps existing discovery routes and V12 navigation; media responses now use private, no-store caching. V12 persistent volume and independently verified daily backup settings remain required for staging.

## V14 promotion marketplace

New campaign drafts use the seven-step builder. Icon (minimum square 1024) and background (16:9 minimum 1600x900) are decoded and normalized server-side; draft images are private. Promotion catalogue and packages are editable by verified MFA administrators. Final checkout calculates the reward pool, 5% fee and optional promotions on the server, validates media and current inventory, and activates placements atomically only on confirmed sandbox checkout. Legacy campaigns remain compatible; set VIEWLY_V14_REQUIRED=true in staging to prevent older creation endpoints bypassing the wizard. Sandbox orders never charge real money; real checkout remains deliberately blocked. Placements are labeled sponsored/test and expire by timestamp; no guaranteed traffic. Branding is included in existing backups. Replaced artwork is retained temporarily to avoid racing an in-progress snapshot; monitor volume capacity. Advanced crop tools, scheduled launches and real payment/tax integrations are not included.

## V15 growth and future PayPal payments

Referrals are opt-in via an invitation URL and must be claimed in the first seven days. Both accounts must be active and email verified, the invited account must be at least 24 hours old, and qualification must occur within 30 days. Five qualified referrals per inviter maximum; each qualifying pair receives one 20% reduction of the platform fee on a campaign checkout, expiring after 30 days. No stacking, cash credit, or reduction of the clipper reward pool. Basic self/referral-loop controls are not a complete multi-account fraud solution. Current discounts and premium access are sandbox-only for checkout, with live payment and verified plan integration blocked. Premium threshold is strictly greater than EUR 2,000 in funded reward pool. First entry in each payment mode is free, then an active eligible plan is required for new premium entries; joined campaigns remain accessible. Existing historic submissions are not retroactively charged. Four lightweight CSS 3D onboarding scenes explain campaign setup, verified rewards, premium access and invites. No rendered MP4 assets yet.

PayPal integration is NOT connected. Final quotes separate clipper reward pool from platform revenue (net platform fee after perk plus promotion charges). Future approved marketplace processing must allocate reward funds to the provider-authorized flow and fees to the verified merchant, reconcile signed provider events, prevent duplicate capture, handle disputes/refunds and meet legal/compliance requirements. Do not put credentials in chat or repository; use provider-authorized setup and Railway secret variables. No claim of instant availability or actual revenue is made from a sandbox quote.

## V17 cinematic intro

A self-contained WebGL introduction renders an extruded beveled VIEWLY logo, lit metallic surfaces, 3D orbital rings, particles and animated sound-inspired geometry. It runs in parallel with real application initialization; the full cinematic minimum is 4.4 seconds, with a skip control and 1.25-second downward reveal of the actual application. Reduced-motion and data-saving preferences bypass the cinematic; WebGL failure uses a CSS fallback. Rendering resolution and frame rate are capped on small/low-core devices, and GPU objects are released on completion. A 15-second startup watchdog exposes a retry screen rather than blocking indefinitely. There are no external video assets or audio. The left navigation, payments and storage remain unchanged.

### Personalized campaign launch film

A new checkout atomically stores an owner-only campaign snapshot alongside the order. The in-browser cinematic replays the original art, brief, creative rules, rewards, media kit, promotional choices and confirmed order summary with original synthesized Web Audio cues, pause, replay, mute, skip and a downloadable text test confirmation. Long descriptions are paginated. The film is a live animated composition, not an exported MP4. The receipt is explicitly a noncash sandbox record, not an invoice or proof of payment. No real payment success film is enabled until a verified payment provider is integrated. Existing prior orders are not silently backfilled. Database snapshots are included in the existing SQLite backup.
