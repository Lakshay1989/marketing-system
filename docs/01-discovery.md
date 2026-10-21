# Phase 1: discovery and stack decision

## Environment found (this Mac)
Node 24, npm 11, Python 3.9, ffmpeg 8, Google Chrome. No Docker, Postgres, Redis, gh or wrangler pre-installed (wrangler runs via npx).

## Decisions
| Need | Choice | Why |
|---|---|---|
| App | Next.js 16 + TypeScript + Tailwind | Same skills as the Kukur store; fast to build and deploy |
| Database | PostgreSQL: Neon in production, PGlite (real Postgres in-process) locally and in tests | No installs, real SQL semantics (`FOR UPDATE SKIP LOCKED`), tests run against Postgres |
| ORM / migrations | Drizzle | Works with both PGlite and Neon |
| Queue and scheduler | Postgres table (`jobs`) | Deterministic, no extra service, idempotency via unique key; Redis can come later if volume needs it |
| Media storage | Cloudflare R2 (S3-compatible) | Meta needs public URLs; cheap egress |
| Agents | Deterministic code for scheduling, validation, retries; the language model only for research reasoning, concepts and captions | Avoids runaway cost; budget-capped |
| Rendering | Reuse the Kukur motion-graphics engine (Chrome + ffmpeg) | Already proven on 10 reels and 13 stories |
| Hosting | Dashboard on Cloudflare Workers (like Kukur) or any Node host; **worker needs an always-on machine with Chrome and ffmpeg** (a small VPS or container; the Mac works for the pilot) | Rendering cannot run on Workers |

## External dependencies and costs (to confirm)
Anthropic API (pay per use, budget-capped in settings and in the Anthropic console) · Neon (free tier to start) · Cloudflare R2 (free tier to start) · Meta developer app (free) · a worker host (free on your Mac for the pilot; a small paid VPS later).

## Why a separate project
No shared code, tables, tokens or scheduler with any other project. Only context was read; nothing existing was modified.
