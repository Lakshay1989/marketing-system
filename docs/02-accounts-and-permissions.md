# Accounts, permissions and connection checklist

Only you can do these (identity, 2FA, payments, consent). Values go in `.env` locally or the host's secret store, never in chat or git.

## 1. Meta (Instagram and Facebook publishing)
1. Instagram account `@kukur.petstoreindia` must be a **Business or Creator** account, linked to the Kukur **Facebook Page**.
2. Create an app at developers.facebook.com (type Business). Add the Instagram Graph API and Facebook Login for Business products.
3. Permissions typically needed (confirm in Meta's current docs at setup): `instagram_basic`, `instagram_content_publish`, `instagram_manage_insights`, `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`, `read_insights`.
4. For accounts that belong to people with a role on your own app (you), development-mode access is normally enough to publish to your own accounts; broader use needs App Review. Verify this during Phase 5 with a controlled test post.
5. Generate a long-lived **Page access token**, find `META_PAGE_ID` and `META_IG_USER_ID`, and put them in `.env`. The dashboard Settings page shows only whether each is configured.
6. Test with one harmless Reel first (Review mode). Verified publish = platform returns a permalink.

## 2. Anthropic (agent reasoning)
Create an API key in console.anthropic.com, set a monthly spend limit there, and put the key in `ANTHROPIC_API_KEY`. The app also stops calls at `AI_MONTHLY_BUDGET_USD`.

## 3. Storage and database
Neon: new project for this app (`DATABASE_URL`). Cloudflare R2: a bucket with a public domain (`MEDIA_*`).

## 4. Repository
Proposed name: **kukur-marketing-ai** (private GitHub repo).

## Needs manual action or paid plans
Stories stickers (poll, quiz, question, link) and in-app music; trending-audio discovery; paid ads; App Review if you ever connect accounts you do not own.
