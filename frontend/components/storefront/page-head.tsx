import Link from "next/link";
import type { ReactNode } from "react";

export type Crumb = { label: string; href?: string };

export function Crumbs({ items }: { items: Crumb[] }) {
  return (
    <nav className="sf-crumbs" aria-label="অবস্থান">
      <ol>
        {items.map((c, i) => (
          <li key={`${c.label}-${i}`}>
            {c.href && i < items.length - 1 ? <Link href={c.href}>{c.label}</Link> : <span aria-current={i === items.length - 1 ? "page" : undefined}>{c.label}</span>}
          </li>
        ))}
      </ol>
    </nav>
  );
}

/** Burgundy hero header shared by the customer pages (shop, packs, authors, cart, orders…). */
export function PageHero({ crumbs, kicker, title, sub, icon, aside, children, tone = "wine", className = "" }: {
  crumbs: Crumb[];
  kicker?: ReactNode;
  title: ReactNode;
  sub?: ReactNode;
  icon?: ReactNode;
  aside?: ReactNode;
  children?: ReactNode;
  tone?: "wine" | "sage" | "paper";
  className?: string;
}) {
  return (
    <header className={`sf-phero tone-${tone}${className ? ` ${className}` : ""}`}>
      <span className="sf-phero-orb a" aria-hidden="true" />
      <span className="sf-phero-orb b" aria-hidden="true" />
      <div className="sf-phero-in">
        <Crumbs items={crumbs} />
        <div className="sf-phero-row">
          <div className="sf-phero-copy">
            {kicker ? <p className="sf-phero-kick">{icon ? <span className="sf-phero-ico">{icon}</span> : <i />}{kicker}</p> : null}
            <h1>{title}</h1>
            {sub ? <p className="sf-phero-sub">{sub}</p> : null}
          </div>
          {aside ? <div className="sf-phero-aside">{aside}</div> : null}
        </div>
        {children}
      </div>
    </header>
  );
}
