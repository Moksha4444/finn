import type { MetadataRoute } from "next";

export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "FINN · Investment agent", // install + splash screen only; the header says just FINN
    short_name: "FINN",
    description: "What changed in your portfolio, ranked by what matters.",
    start_url: "/",
    display: "standalone",
    background_color: "#f8f5ef",
    theme_color: "#f8f5ef",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/icons/mono.svg", sizes: "any", type: "image/svg+xml", purpose: "monochrome" },
    ],
  };
}
