# Kukur Marketing AI

Standalone, autonomous social-media marketing system for **Kukur Pet Store India** (Instagram `@kukur.petstoreindia` and the Kukur Facebook Page).
Separate from every other project: own repo, own database, own scheduler, own config, own port (3402). It does not use or modify the existing AI dashboard.

**Read first:** [`docs/STATUS.md`](docs/STATUS.md) says exactly what works, what is tested, and what is still blocked.

## Run locally
```bash
npm install
cp .env.example .env        # set ADMIN_PASSWORD (12+ chars) and SESSION_SECRET (32+ chars); leave DATABASE_URL empty
npm run dev                 # http://localhost:3402 (embedded Postgres in ./.data/pglite)
npm run worker              # background worker: schedules, publishes (verified), daily report
npm test                    # 28 tests: queue, controls, publishing verification, Meta client, reports, persistence, auth
npm run typecheck
```

For local inference without a Claude subscription or API key, install and start [Ollama](https://ollama.com), pull a model that fits your Mac, then set `AI_PROVIDER=ollama` and `AI_MODEL=<the pulled model name>` in `.env`. `OLLAMA_BASE_URL` defaults to `http://127.0.0.1:11434`. Trend research defaults to public Google News RSS headlines/summaries and opens the linked items. For richer direct web search, run SearXNG and set `WEB_SEARCH_PROVIDER=searxng` plus `SEARXNG_BASE_URL`; this uses no commercial search API key. Search engines and publishers can still rate-limit or block requests, which the agent records rather than inventing trends. Keep Ollama and SearXNG endpoints on localhost or a private network, never expose them publicly without authentication and network controls.

## Stack
Next.js 16 (App Router) + TypeScript + Tailwind v4 · Drizzle ORM + PostgreSQL (Neon in production, PGlite embedded locally and in tests) · Postgres-backed job queue (idempotency keys, retry with backoff, dead-letter, stale-job recovery) · zod · vitest · Meta Graph API client.

## Layout
`src/db` schema + migrations (`drizzle/`) · `src/lib` queue, controls, agents, reports, auth, publishing · `src/app` dashboard and API · `worker/` scheduler and publisher loop · `tests/` · `docs/`.

## Safety rules built into the code
- Default mode is **Review**: nothing publishes without your approval and a manual publish.
- One gate (`mayPublish`) checks emergency stop, pause-all, mode/approval, agent enabled and daily limit before any publish.
- A publication counts only after the platform returns a permalink (verified lookup). Otherwise it is recorded as failed/submitted, never "published".
- Idempotent: an item that has a verified publication can never be posted twice.
- No tokens in the database, frontend or logs (errors are redacted). No automatic deletion of social posts exists in this codebase.
