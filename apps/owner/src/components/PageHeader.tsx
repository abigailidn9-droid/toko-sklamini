import type { ReactNode } from "react";
import type { Page } from "./NavGlyph.tsx";
import { NavGlyph } from "./NavGlyph.tsx";

export function PageShell({
  page,
  title,
  hint,
  actions,
  children,
}: {
  page: Page;
  title: string;
  hint: string;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="stack page-fill">
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
        {actions ? <div className="page-head-actions">{actions}</div> : null}
      </header>
      {children != null ? <div className="page-body">{children}</div> : null}
    </div>
  );
}
