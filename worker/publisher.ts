import { MetaError, metaClient, type Verified } from "../src/lib/publish/meta";
import type { Publisher } from "../src/lib/publish/execute";

/** Builds the real Meta publisher from environment variables, or explains exactly what is missing. */
export function envPublisher(env = process.env): Publisher {
  const need = ["META_PAGE_ID", "META_IG_USER_ID", "META_PAGE_ACCESS_TOKEN"].filter((k) => !env[k]);
  return async (item, asset): Promise<Verified> => {
    if (need.length) throw new MetaError(`Meta publishing is not configured (missing: ${need.join(", ")})`, false);
    const c = metaClient({ graphVersion: env.META_GRAPH_VERSION ?? "v21.0", pageId: env.META_PAGE_ID!, igUserId: env.META_IG_USER_ID!, pageToken: env.META_PAGE_ACCESS_TOKEN! });
    const caption = [item.caption, item.hashtags.join(" ")].filter(Boolean).join("\n\n");
    if (item.platform === "instagram" && item.format === "reel") return c.publishInstagramReel({ videoUrl: asset.publicUrl!, caption, coverUrl: undefined });
    if (item.platform === "instagram" && item.format === "story") return c.publishInstagramStory(asset.mimeType.startsWith("video") ? { videoUrl: asset.publicUrl! } : { imageUrl: asset.publicUrl! });
    if (item.platform === "facebook" && item.format === "reel") return c.publishFacebookReel({ videoUrl: asset.publicUrl!, description: caption });
    throw new MetaError(`Unsupported combination: ${item.platform} ${item.format} (not implemented yet)`, false);
  };
}
