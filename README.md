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
