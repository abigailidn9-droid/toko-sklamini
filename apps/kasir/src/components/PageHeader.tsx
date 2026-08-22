import type { ReactNode } from "react";
import type { Page } from "../types.ts";
import { NavGlyph } from "./NavGlyph.tsx";

export function PageHeader({
  page,
  title,
  hint,
  children,
}: {
  page: Page;
  title: string;
  hint: string;
  children?: ReactNode;
}) {
  return (
    <header className="page-head">
      <div className="page-head-main">
        <span className="page-head-icon" aria-hidden>
          <NavGlyph page={page} />
        </span>
        <div className="page-head-copy">
          <h2 className="h2">{title}</h2>
          <p>{hint}</p>
        </div>
      </div>
      {children ? <div className="page-head-actions">{children}</div> : null}
    </header>
  );
}

export function PageShell({
  page,
  title,
  hint,
  actions,
  children,
  className,
}: {
  page: Page;
  title: string;
  hint: string;
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`stack page-fill${className ? ` ${className}` : ""}`}>
      <PageHeader page={page} title={title} hint={hint}>
        {actions}
      </PageHeader>
      {children != null ? <div className="page-body">{children}</div> : null}
    </div>
  );
}
