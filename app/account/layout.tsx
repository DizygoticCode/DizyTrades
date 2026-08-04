import Link from "next/link";
import type { ReactNode } from "react";

export default function AccountCompanionLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <nav
        aria-label="DizyAccount Companion sections"
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 10,
          padding: "12px 32px",
          borderBottom: "1px solid #203641",
          background: "#071014",
        }}
      >
        <Link href="/account" style={{ color: "#d9ebf3", textDecoration: "none" }}>
          Live account and reconciliation
        </Link>
        <Link href="/account/preview" style={{ color: "#64e9e0", textDecoration: "none" }}>
          Hypothetical order preview
        </Link>
        <Link href="/account/audit" style={{ color: "#b8dce2", textDecoration: "none" }}>
          Immutable audit ledger
        </Link>
      </nav>
      {children}
    </>
  );
}
