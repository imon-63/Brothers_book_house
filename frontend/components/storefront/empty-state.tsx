import type { ReactNode } from "react";
import { GBag, GBell, GBook, GBox, GHeart, GSearch, GTruck, GUser } from "./glyphs";

const ART = { bag: GBag, bell: GBell, book: GBook, box: GBox, heart: GHeart, search: GSearch, truck: GTruck, user: GUser };

/** Friendly empty state: illustrated badge, title, helper text and optional actions. */
export function EmptyState({ art = "box", title, text, children, className = "" }: {
  art?: keyof typeof ART;
  title: string;
  text?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  const Ico = ART[art];
  return (
    <div className={`sf-empty${className ? ` ${className}` : ""}`}>
      <div className="sf-empty-art" aria-hidden="true">
        <span className="sf-empty-ring" />
        <span className="sf-empty-ico"><Ico size={38} /></span>
        <i className="sf-empty-dot a" /><i className="sf-empty-dot b" /><i className="sf-empty-dot c" />
      </div>
      <h3>{title}</h3>
      {text ? <p>{text}</p> : null}
      {children ? <div className="sf-empty-acts">{children}</div> : null}
    </div>
  );
}
