import Image from "next/image";
import styles from "./product-visual.module.css";

type ProductVisualProps = {
  src: string;
  alt: string;
  label?: string;
  priority?: boolean;
  aspectRatio?: `${number} / ${number}`;
  contain?: boolean;
};

/** Shared presentation frame for real DizyTrades product screenshots. */
export default function ProductVisual({
  src,
  alt,
  label,
  priority = false,
  aspectRatio = "16 / 9",
  contain = false,
}: ProductVisualProps) {
  return (
    <figure className={styles.frame}>
      <div className={styles.chrome} aria-hidden="true">
        <span />
        <span />
        <span />
        {label ? <b>{label}</b> : null}
      </div>
      <div
        className={contain ? `${styles.viewport} ${styles.contain}` : styles.viewport}
        style={{ aspectRatio }}
      >
        <Image
          alt={alt}
          fill
          priority={priority}
          sizes="(max-width: 760px) 100vw, (max-width: 1200px) 90vw, 1180px"
          src={src}
        />
      </div>
    </figure>
  );
}
