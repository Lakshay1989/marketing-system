# Accounts, permissions and connection checklist

Only you can do these (identity, 2FA, payments, consent). Values go in `.env` locally or the host's secret store, never in chat or git.

## 1. Meta (Instagram and Facebook publishing)
1. Instagram account `@kukur.petstoreindia` must be a **Business or Creator** account, linked to the Kukur **Facebook Page**.
2. Create an app at developers.facebook.com (type Business). Add the Instagram Graph API and Facebook Login for Business products.
3. Permissions typically needed (confirm in Meta's current docs at setup): `instagram_basic`, `instagram_content_publish`, `instagram_manage_insights`, `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`, `read_insights`.
4. For accounts that belong to people with a role on your own app (you), development-mode access is normally enough to publish to your own accounts; broader use needs App Review. Verify this during Phase 5 with a controlled test post.
5. Generate a long-lived **Page access token**, find `META_PAGE_ID` and `META_IG_USER_ID`, and put them in `.env`. The dashboard Settings page shows only whether each is configured.
6. Test with one harmless Reel first (Review mode). Verified publish = platform returns a permalink.

## 2. Language model
Model access is configured in `.env` with `AI_PROVIDER`: `auto` prefers `ANTHROPIC_API_KEY`, then the local `claude` CLI; `claude-cli` selects the CLI explicitly; `anthropic` selects the API explicitly; and `ollama` uses a locally running Ollama server. Set `AI_MODEL` to the model name expected by the selected provider. For Ollama, use `OLLAMA_BASE_URL` if it is not at `http://127.0.0.1:11434`. No API key or Claude subscription is needed for local inference. Trend research defaults to public Google News RSS headlines/summaries, then opens linked HTTPS pages. For broader direct search, run SearXNG and set `WEB_SEARCH_PROVIDER=searxng` and `SEARXNG_BASE_URL`; this requires no commercial API key. Keep the SearXNG endpoint private. Both search engines and publisher pages may rate-limit or block requests. The app's daily-call and monthly AI budgets remain in force; Ollama inference is logged at zero provider cost.

## 3. Storage and database (DONE 22 Oct)
Neon project `kukur-marketing-ai` (`DATABASE_URL`). S3 bucket `kukur-marketing-media-502657994824` in ap-southeast-2 with a bucket-only IAM user `kukur-marketing-worker` (`MEDIA_S3_*`). Note: your AWS organization policy only allowed bucket creation in some regions (Mumbai was denied).

## 4. Repository
Repo: https://github.com/Lakshay1989/marketing-system (currently public; make it private).

## Needs manual action or paid plans
Stories stickers (poll, quiz, question, link) and in-app music; trending-audio discovery; paid ads; App Review if you ever connect accounts you do not own.
