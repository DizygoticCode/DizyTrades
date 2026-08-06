"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { CSSProperties } from "react";
import {
  activeDizyProduct,
  DIZY_PRODUCT_LINKS,
  showSharedProductNavigation,
} from "./lib/product-navigation";
import { MexcReferralLink } from "./mexc-referral-link";
import styles from "./product-navigation.module.css";

type ProductAccentStyle = CSSProperties & { "--product-accent": string };

export function ProductNavigation() {
  const pathname = usePathname();
  if (!showSharedProductNavigation(pathname)) return null;

  const activeProduct = activeDizyProduct(pathname);
  return (
    <header className={styles.shell} data-testid="dizy-product-navigation">
      <Link className={styles.brand} href="/" title="Open Everything Dizy">
        <span aria-hidden="true" className={styles.mark} />
        <span className={styles.brandText}>DizyTrades</span>
      </Link>
      <nav aria-label="Dizy product navigation" className={styles.products}>
        {DIZY_PRODUCT_LINKS.map((product) => {
          const active = activeProduct === product.id;
          return (
            <Link
              aria-current={active ? "page" : undefined}
              className={`${styles.product} ${active ? styles.active : ""}`}
              href={product.href}
              key={product.id}
              style={{ "--product-accent": product.accent } as ProductAccentStyle}
              title={product.title}
            >
              <span aria-hidden="true" className={styles.icon}>{product.icon}</span>
              <span>{product.label}</span>
            </Link>
          );
        })}
      </nav>
      <MexcReferralLink />
    </header>
  );
}
