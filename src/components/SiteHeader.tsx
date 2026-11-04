"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconWave } from "./Icons";
import { ThemeSwitch } from "./ThemeSwitch";

export function SiteHeader() {
  const path = usePathname();
  const onProblems = path === "/" || path.startsWith("/practice");
  return (
    <header className="site-header">
      <div className="nav-bar">
        <Link href="/" className="brand" aria-label="Voxora home">
          <span className="brand-mark">
            <IconWave size={16} />
          </span>
          Voxora
        </Link>
        <nav className="nav" aria-label="Main">
          <ThemeSwitch />
          <Link href="/" aria-current={onProblems ? "page" : undefined}>
            Problems
          </Link>
          <Link href="/history" className="nav-cta" aria-current={path.startsWith("/history") ? "page" : undefined}>
            Saved sessions
          </Link>
        </nav>
      </div>
    </header>
  );
}
