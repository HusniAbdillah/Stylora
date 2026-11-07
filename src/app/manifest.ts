import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Stylora",
    short_name: "Stylora",
    description: "Turn outfit inspiration into everyday decisions.",
    lang: "en",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#F5F2EC",
    theme_color: "#F5F2EC",
    categories: ["lifestyle", "shopping"],
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    shortcuts: [
      { name: "Create an outfit", url: "/create" },
      { name: "Wardrobe", url: "/wardrobe" },
      { name: "Preview an outfit", url: "/preview" },
    ],
    prefer_related_applications: false,
  };
}
