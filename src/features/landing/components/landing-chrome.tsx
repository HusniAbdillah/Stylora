"use client";

import Link from "next/link";
import { useState } from "react";
import { Button, Drawer, Icon, Logo } from "@/components/ui";
import type { LandingLinks } from "./landing-sections";

const nav = [
  { label: "Create", key: "createHref" },
  { label: "Wardrobe", key: "wardrobeHref" },
  { label: "Capsules", key: "capsulesHref" },
  { label: "Preview", key: "previewHref" },
  { label: "Saved looks", key: "savedLooksHref" },
  { label: "Preferences", key: "preferencesHref" },
] as const;

export function LandingHeader({
  links,
  homeHref = "/",
}: {
  links: LandingLinks;
  homeHref?: string;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <header className="relative z-10 bg-porcelain">
      <div className="mx-auto flex max-w-[1320px] items-center justify-between gap-4 px-4 py-4 sm:px-8 lg:px-12">
        <Link href={homeHref} aria-label="Stylora home">
          <Logo tone="crimson" />
        </Link>
        <nav
          className="hidden items-center gap-6 text-sm font-medium text-ink lg:flex"
          aria-label="Main navigation"
        >
          {nav.map((item) => (
            <Link
              key={item.key}
              href={links[item.key]}
              className="hover:text-crimson"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="hidden lg:block">
          <Button variant="primary" asChild>
            <Link href={links.createHref}>Upload inspiration</Link>
          </Button>
        </div>
        <button
          type="button"
          className="flex size-11 items-center justify-center rounded-xl lg:hidden"
          onClick={() => setMenuOpen(true)}
          aria-expanded={menuOpen}
          aria-label="Open menu"
        >
          <Icon name="menu" />
        </button>
      </div>
      <Drawer
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        title="Explore Stylora"
        side="left"
      >
        <nav className="grid gap-1" aria-label="Mobile navigation">
          {nav.map((item) => (
            <Link
              key={item.key}
              href={links[item.key]}
              onClick={() => setMenuOpen(false)}
              className="rounded-xl px-3 py-2.5 text-sm font-medium text-ink hover:bg-blush"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </Drawer>
    </header>
  );
}

export function LandingFooter() {
  return (
    <footer className="bg-night px-4 py-7 text-paper sm:px-8 lg:px-12">
      <div className="mx-auto flex max-w-[1320px] flex-col gap-4 text-xs text-paper/75 sm:flex-row sm:items-center sm:justify-between">
        <Logo tone="paper" />
        <p>Shared demo workspace. Please use non-sensitive outfit images.</p>
        <p>Dress with intention.</p>
      </div>
    </footer>
  );
}
