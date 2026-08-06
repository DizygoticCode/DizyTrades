import { MEXC_REFERRAL_CODE, MEXC_REFERRAL_URL } from "./lib/product-navigation";
import styles from "./mexc-referral-link.module.css";

export function MexcReferralLink({
  variant = "global",
  className = "",
}: Readonly<{
  variant?: "global" | "terminal";
  className?: string;
}>) {
  const classes = [styles.link, styles[variant], className].filter(Boolean).join(" ");
  return (
    <a
      aria-label={`Need a broker? Try MEXC using the DizyTrades referral link, code ${MEXC_REFERRAL_CODE}. Opens in a new tab.`}
      className={classes}
      href={MEXC_REFERRAL_URL}
      rel="noopener noreferrer sponsored"
      target="_blank"
      title={`Optional MEXC referral link · code ${MEXC_REFERRAL_CODE}`}
    >
      <span className={styles.prefix}>Need a broker?</span>
      <strong>Try MEXC</strong>
      <span aria-hidden="true">↗</span>
      <span className={styles.disclosure}>Referral</span>
    </a>
  );
}
