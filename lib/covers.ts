// Post covers, copied into the public `covers` Supabase bucket.
import { supaHeaders } from "./server";

const bucketUrl = (code: string, prefix = "ig") =>
  `${process.env.SUPABASE_URL!.replace(/\/$/, "")}/storage/v1/object/public/covers/${prefix}/${code}.jpg`;

/**
 * Instagram CDN urls expire within days, so a cover is only useful once we
 * hold it ourselves. Uploads to the public `covers` bucket, and returns
 * null (leaving whatever cover the row already had) if anything fails —
 * a missing thumbnail should never fail a metrics sync.
 */
export async function storeCover(code: string, src: string, prefix = "ig"): Promise<string | null> {
  try {
    const img = await fetch(src, { cache: "no-store" });
    if (!img.ok) return null;
    const body = Buffer.from(await img.arrayBuffer());
    const url = `${process.env.SUPABASE_URL!.replace(/\/$/, "")}/storage/v1/object/covers/${prefix}/${code}.jpg`;
    const put = await fetch(url, {
      method: "POST",
      headers: {
        ...supaHeaders(),
        "Content-Type": "image/jpeg",
        "x-upsert": "true",
      },
      body: body as unknown as BodyInit,
    });
    return put.ok ? bucketUrl(code, prefix) : null;
  } catch {
    return null;
  }
}
