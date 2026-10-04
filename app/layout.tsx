import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Orbitron } from "next/font/google";
import "./globals.css";
import { AppShell } from "@/components/app-shell";
import { Toaster } from "@/components/ui/sonner";
import { BRAND_NAME } from "@/lib/brand";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Display face for the wordmark ONLY — body text stays Geist.
const orbitron = Orbitron({
  variable: "--font-orbitron",
  subsets: ["latin"],
  weight: ["500", "700"],
});

export const metadata: Metadata = {
  title: `${BRAND_NAME} — instagram → ads, one feed`,
  description:
    "Your Instagram feed with views and engagement per post, a Promote button that runs any post as a Meta ad, and the Meta campaign's spend and cost per result in one place.",
  applicationName: BRAND_NAME,
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "default", title: BRAND_NAME },
};

export const viewport: Viewport = {
  themeColor: "#406cb8",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} ${orbitron.variable} h-full antialiased`}>
      <body className="min-h-dvh flex flex-col bg-background">
        <AppShell>{children}</AppShell>
        <Toaster position="top-center" richColors closeButton />
      </body>
    </html>
  );
}
