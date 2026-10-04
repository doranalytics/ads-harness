// The one place the name lives. The wordmark reads "<BRAND_NAME> harness";
// set NEXT_PUBLIC_BRAND_NAME in Vercel (e.g. "acme") to put your business
// on the header, sign-in screen and tab title. Default: "ads harness".
export const BRAND_NAME = (process.env.NEXT_PUBLIC_BRAND_NAME ?? "").trim() || "ads";
export const APP_NAME = `${BRAND_NAME} harness`;
