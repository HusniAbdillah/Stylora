"use client";

import Link from "next/link";
import { useState } from "react";
import { Button, Drawer, Icon, Logo } from "@/components/ui";
import type { LandingLinks } from "./landing-sections";
import styles from "./landing.module.css";

const nav = [
  { label: "Create", key: "createHref", icon: "plus" },
  { label: "Wardrobe", key: "wardrobeHref", icon: "shirt" },
  { label: "Capsules", key: "capsulesHref", icon: "layers" },
  { label: "Preview", key: "previewHref", icon: "avatar" },
  { label: "Saved looks", key: "savedLooksHref", icon: "bookmark" },
  { label: "Preferences", key: "preferencesHref", icon: "sliders" },
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
    <header className={styles.header}>
      <Link href={homeHref} aria-label="Stylora home">
        <Logo tone="crimson" className={styles.headerLogo} />
      </Link>
      <nav className={styles.desktopNav} aria-label="Main navigation">
        {nav.map((item) => (
          <Link key={item.key} href={links[item.key]}>
            {item.label}
          </Link>
        ))}
      </nav>
      <div className={styles.headerAction}>
        <Button asChild>
          <Link href={links.createHref}>Upload inspiration</Link>
        </Button>
      </div>
      <button
        type="button"
        className={styles.menuButton}
        onClick={() => setMenuOpen(true)}
        aria-expanded={menuOpen}
        aria-label="Open menu"
      >
        <Icon name="menu" size={24} />
      </button>
      <Drawer
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        title="Stylora"
        side="left"
      >
        <nav className={styles.drawerNav} aria-label="Mobile navigation">
          {nav.map((item) => (
            <Link
              key={item.key}
              href={links[item.key]}
              onClick={() => setMenuOpen(false)}
            >
              <Icon name={item.icon} size={22} />
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
    <footer className={styles.footer}>
      <Logo tone="paper" />
      <p>Shared demo workspace. Please use non-sensitive outfit images.</p>
      <p>Dress with intention.</p>
    </footer>
  );
}
