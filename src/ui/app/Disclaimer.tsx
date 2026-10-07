import { it } from '../i18n/it';
import styles from './Disclaimer.module.css';

/** First-run gate. The red slab is the brand, the same whatever the user's values are. */
export function Disclaimer({ onAccept }: { onAccept: () => void }) {
  return (
    <div className={styles.page}>
      <header className={styles.slab}>
        <p className={`display ${styles.brand}`}>bloodio</p>
        <h1 className={`display ${styles.title}`}>{it.disclaimer.title}</h1>
      </header>
      <div className={styles.body}>
        {it.disclaimer.body.map((paragraph) => (
          <p key={paragraph}>{paragraph}</p>
        ))}
        <button type="button" className={styles.accept} onClick={onAccept}>
          {it.disclaimer.accept}
        </button>
      </div>
    </div>
  );
}
