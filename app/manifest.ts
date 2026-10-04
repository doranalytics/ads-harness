import type { MetadataRoute } from "next";
import { APP_NAME, BRAND_NAME } from "@/lib/brand";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: APP_NAME,
    short_name: BRAND_NAME,
    description: "Instagram → ads, one feed.",
    start_url: "/",
    display: "standalone",
    background_color: "#f8f4f0",
    theme_color: "#406cb8",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
