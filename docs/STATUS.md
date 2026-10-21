# Status (21 Oct 2026): implemented vs blocked

## Implemented and tested (28 automated tests pass; browser-tested locally)
| Area | What exists |
|---|---|
| Foundation | New repo, own DB schema (17 tables) and migration, embedded Postgres for local/tests, Neon for production, auth (single owner password, signed session), health endpoint, JSON export of all data |
| Queue and scheduler | Postgres job queue: idempotency keys, exponential backoff, dead-letter, stale-job recovery, daily-report job, schedule-due publishing |
| Controls | Review / Supervised / Autonomous modes (default Review), pause all, pause or disable each agent, emergency stop, daily publish limit, full audit log |
| Publishing | `publishItem`: gate, QA-passed asset required, public media URL required, idempotent, verified-only success, transient vs permanent error handling |
| Meta client | Instagram Reel/Story and Facebook Reel flows with container polling and permalink verification; account check. **Unit-tested with mocked responses only. Not yet run against the live Meta API.** |
| Reports | CEO daily and weekly report built from stored facts; unverified or failed publications are listed as blockers |
| Dashboard | Overview, Agent Control Centre, Content Studio (preview, QA status, approve / reject / request revision, publish), Calendar (Instagram and Facebook), Trends, Analytics, History (publications, runs, jobs, approvals, reports, audit), Settings (limits, connection checklist) |
| Agents | The nine agents exist as records with run tracking, enable/disable, status and error reporting |

## NOT implemented yet (needs building, in this order)
1. **Agent "brains"**: trend research from real public sources with saved evidence, concept generation and scoring (needs `ANTHROPIC_API_KEY` and a budget), caption and hashtag writing.
2. **Creative Production integration**: port the proven Kukur reel/story render pipeline (HTML motion engine, Chrome frame capture, ffmpeg, original audio) into this repo as a production job.
3. **Automated QA checks**: ffprobe (size, duration, codec, audio loudness), spell check, price check against the website catalogue, duplicate detection.
4. **Media storage upload** to R2/S3 (Meta needs a public URL for video files) and storing `storageKey` / `publicUrl`.
5. **Analytics collection** from the Instagram and Facebook Insights APIs into `metrics_snapshots`, plus charts.
6. **Account connection flow** (verify tokens, permissions, publishing eligibility) and Facebook Stories / Page posts.
7. **Production deployment** of the dashboard and a worker host, plus alerts (email or WhatsApp) for failures.

## Blocked on the owner (cannot be done without your accounts or decisions)
See `docs/02-accounts-and-permissions.md`: Meta developer app and permissions, Anthropic API key and budget, Neon project, R2 bucket, GitHub repository, where the worker runs.

## Known platform limits (verify at setup)
- No official API gives "trending audio" or trending Reels; research must use public web sources and your curated references.
- Instagram API Stories cannot carry polls, quizzes, question or link stickers, and cannot add Instagram's music: those stay manual in the app (the Stories package already marks them).
- Licensed music cannot be added through the API; audio must be inside the video file (we use original soundtracks).
