/** Parse only install events, never clicks or a generic campaign result.
 * Multiple attribution windows overlap: select default, never add them. */
export function metaInstallMetrics(payload: Record<string, unknown>) {
  const number = (v: unknown): number | null => {
    if (typeof v !== "string" && typeof v !== "number") return null;
    const s = String(v).replace(/,/g, "").trim();
    if (!/^\d+(\.\d+)?$/.test(s)) return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  };
  const isInstall = (v: unknown) => typeof v === "string" && [
    "offsite_conversion.fb_pixel_custom.appstack_install", "appstack_install",
    "mobile_app_install", "omni_app_install", "app_install",
  ].includes(v.replace(/^conversions:/, ""));
  let installs: number | null = null;
  const result = payload.results as { indicator?: string; value?: unknown; values?: { value?: unknown; attribution_windows?: string[] }[] } | undefined;
  if (result && isInstall(result.indicator)) {
    const windows = result.values ?? [];
    const value = windows.find((x) => x.attribution_windows?.includes("default")) ?? (windows.length === 1 ? windows[0] : undefined);
    installs = number(value?.value ?? result.value);
  } else if (Array.isArray(payload.actions)) {
    const action = payload.actions.find((x: { action_type?: string }) => isInstall(x.action_type));
    installs = number(action?.value);
  }
  const rawSpend = payload.spend ?? payload.amount_spent;
  const spend = typeof rawSpend === "string" ? number(rawSpend.replace(/^\$/, "").replace(/\s+USD$/, "")) : number(rawSpend);
  return { metaInstalls: installs, metaInstallSpend: spend };
}
