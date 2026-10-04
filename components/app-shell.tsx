"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Cable, Camera, Loader2, Megaphone, Settings } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useHarness } from "@/lib/store";
import { cn } from "@/lib/utils";
import { BRAND_NAME } from "@/lib/brand";

/** The mark: a plain ring and dot in the primary colour. Swap for a logo
 * by dropping an image in public/ and rendering it here. */
export function Mark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={cn("text-primary", className)} aria-hidden>
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2.5" />
      <circle cx="12" cy="12" r="3.5" fill="currentColor" />
    </svg>
  );
}

/** The front door. No demo behind it: without the password the harness
 * shows nothing, because everything it shows is real. */
function LockScreen() {
  const { unlock } = useHarness();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [wrong, setWrong] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password || busy) return;
    setBusy(true);
    setWrong(false);
    try {
      await unlock(password); // reloads on success
    } catch {
      setWrong(true);
      setBusy(false);
    }
  };
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-4">
      <div className="w-full max-w-[300px]">
        <div className="mb-6 flex items-center gap-2.5">
          <Mark className="size-9 text-primary" />
          <div className="leading-none">
            <p className="wordmark text-[17px] text-primary">{BRAND_NAME}</p>
            {BRAND_NAME !== "harness" && <p className="wordmark-light mt-0.5 text-[11px] text-muted-foreground">harness</p>}
          </div>
        </div>
        <form onSubmit={submit} className="space-y-2.5">
          <Input
            type="password"
            autoFocus
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setWrong(false);
            }}
            placeholder="password"
            aria-label="Password"
          />
          {wrong && <p className="font-mono text-[11px] text-red-500">wrong password</p>}
          <Button type="submit" disabled={!password || busy} className="w-full">
            {busy ? <Loader2 className="size-4 animate-spin" /> : "open"}
          </Button>
        </form>
      </div>
    </div>
  );
}

/** Organic (the Instagram feed), Paid (Meta ads) and Connectors. A tab
 * with live: false renders greyed out — the shape without pretending. */
const TABS = [
  { href: "/organic", label: "Organic", icon: Camera, live: true },
  { href: "/paid", label: "Paid", icon: Megaphone, live: true },
  { href: "/connectors", label: "Connectors", icon: Cable, live: true },
];

const OFF_TITLE = "Greyed out until its connector is wired — see Settings";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { init, hydrated, mode } = useHarness();
  useEffect(() => {
    init();
  }, [init]);

  if (hydrated && mode === "locked") return <LockScreen />;

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4">
          <Link href="/organic" className="flex items-center gap-2">
            <Mark className="size-6 text-primary" />
            <span className="wordmark text-[15px] text-primary">{BRAND_NAME}</span>
            {BRAND_NAME !== "harness" && <span className="wordmark-light text-[11px] text-muted-foreground">harness</span>}
          </Link>
          <nav className="hidden items-center gap-1 sm:flex">
            {TABS.map(({ href, label, icon: Icon, live }) =>
              live ? (
                <Link
                  key={href}
                  href={href}
                  className={cn(
                    "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground",
                    pathname === href && "bg-secondary text-foreground"
                  )}
                >
                  <Icon className="size-4" />
                  <span className="wordmark-light text-[12px] lowercase">{label.toLowerCase()}</span>
                </Link>
              ) : (
                <span
                  key={href}
                  aria-disabled
                  title={OFF_TITLE}
                  className="flex cursor-not-allowed items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground/40"
                >
                  <Icon className="size-4" />
                  <span className="wordmark-light text-[12px] lowercase">{label.toLowerCase()}</span>
                </span>
              )
            )}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <Link
              href="/settings"
              aria-label="Settings"
              className={cn(
                "rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground",
                pathname === "/settings" && "bg-secondary text-foreground"
              )}
            >
              <Settings className="size-4" />
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-24 pt-6 sm:pb-10">{children}</main>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 backdrop-blur sm:hidden">
        <div className="grid grid-cols-3 pb-[env(safe-area-inset-bottom)]">
          {TABS.map(({ href, label, icon: Icon, live }) =>
            live ? (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium text-muted-foreground",
                  pathname === href && "text-primary"
                )}
              >
                <Icon className="size-5" />
                <span className="wordmark-light text-[10px] lowercase">{label.toLowerCase()}</span>
              </Link>
            ) : (
              <span key={href} aria-disabled title={OFF_TITLE} className="flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium text-muted-foreground/40">
                <Icon className="size-5" />
                <span className="wordmark-light text-[10px] lowercase">{label.toLowerCase()}</span>
              </span>
            )
          )}
        </div>
      </nav>
    </div>
  );
}
