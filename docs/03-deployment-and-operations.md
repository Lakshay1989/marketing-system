# Deployment, operations and recovery

## Local
`npm install`, copy `.env.example` to `.env`, `npm run dev` (port 3402, never 8765), `npm run worker` in a second terminal.

## Production (once the accounts exist)
1. Create the Neon project and set `DATABASE_URL`; run `npm run db:migrate`.
2. Set secrets on the host: `ADMIN_PASSWORD`, `SESSION_SECRET`, Meta and storage variables.
3. Deploy the dashboard (Cloudflare Workers via OpenNext, or any Node host: `npm run build && npm start`).
4. Run the worker (`npm run worker`) on an always-on machine with Chrome and ffmpeg (supervise it with launchd, systemd or a container restart policy).
5. Start in **Review** mode. Move to Supervised only after several approved posts verify correctly, and to Autonomous only after weeks of reliable, good output.

### Local models and search on EC2
For no-subscription inference, run Ollama on the worker host or on a private model host and set `AI_PROVIDER=ollama`, `AI_MODEL`, and `OLLAMA_BASE_URL`. CPU inference may be slow; size the EC2 instance for the chosen model, or use a GPU instance if throughput justifies its cost. Trend research defaults to Google News RSS summaries. For broader direct search, run SearXNG on a private endpoint and set `WEB_SEARCH_PROVIDER=searxng` and `SEARXNG_BASE_URL`; enable JSON output in its settings. Keep Ollama (11434) and SearXNG (8080) off public interfaces/security groups. If services are containers, use their private service names; the worker needs outbound HTTPS to search results and publisher pages.

## Health and monitoring
`GET /api/health` returns database status and job counts. Dead jobs and failed publications show on the Overview and in the daily report. Alerts by email or WhatsApp are not built yet.

## Runbooks
- **Publishing stuck or wrong:** press **Emergency stop publishing** (sidebar). Nothing publishes until you release it. Check History > Jobs and Audit log.
- **A job is "dead":** read its last error in History, fix the cause (usually token, permission or media URL), then re-request publish from the Content Studio.
- **Token expired:** generate a new Page token, update the secret, restart the worker.
- **Duplicate worry:** an item with a verified publication is never published again (checked in code and by job idempotency keys).
- **Wrong post published:** deleting posts is deliberately NOT automated. Delete manually in the app.

## Backup and recovery
Neon provides point-in-time restore on its plans (check your plan's window). Also download the full JSON export from History regularly (`/api/export`). Media lives in R2 (enable versioning). To rebuild: restore DB, set secrets, deploy, start worker; history and queue resume.
