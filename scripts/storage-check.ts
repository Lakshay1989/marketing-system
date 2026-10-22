// Real round-trip test of the S3 bucket: upload a tiny file, create a signed URL, download it through that URL, compare.
import { putMedia, signedMediaUrl, s3Configured } from "../src/lib/storage";
if (!s3Configured()) { console.log("S3 not configured"); process.exit(1); }
const key = `healthcheck/${Date.now()}.txt`; const body = Buffer.from("kukur-marketing-ai storage check");
await putMedia(key, body, "text/plain");
const url = await signedMediaUrl(key, 300);
const r = await fetch(url); const got = Buffer.from(await r.arrayBuffer());
console.log("signed URL fetch:", r.status, "content matches:", got.equals(body));
const anon = await fetch(url.split("?")[0]); console.log("direct (unsigned) URL is private:", anon.status === 403);
