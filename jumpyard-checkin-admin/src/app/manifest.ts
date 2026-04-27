import type { MetadataRoute } from "next";

export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "JumpYard Staff Check-in",
    short_name: "JY Utlämning",
    description: "Hantera JumpYard check-in och utlämning.",
    start_url: "/",
    display: "standalone",
    background_color: "#FFFFFF",
    theme_color: "#E31837",
    icons: [
      {
        src: "/jumpyard_logo.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/jumpyard_logo.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
  };
}
