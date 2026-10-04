// The one place the business name lives. Set NEXT_PUBLIC_BRAND_NAME in
// Vercel (e.g. "acme") and the header, sign-in screen and tab title use it.
export const BRAND_NAME = (process.env.NEXT_PUBLIC_BRAND_NAME ?? "").trim() || "harness";
