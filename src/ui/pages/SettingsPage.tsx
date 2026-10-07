import { useCallback } from 'react';
import { APP_VERSION } from '../../version';
import { useServices } from '../app/services';
import { useQuery } from '../app/use-query';
import { it } from '../i18n/it';
import shared from '../styles/shared.module.css';
import styles from './SettingsPage.module.css';

export function SettingsPage() {
  const { settings } = useServices();
  const keep = useQuery(
    useCallback(() => settings.get('keepOriginalFile'), [settings]),
    settings.subscribe,
  );
  if (keep.status !== 'ready') return null;

  return (
    <>
      <header className={shared.pageHead}>
        <h1 className={`display ${shared.pageTitle}`}>{it.settings.title}</h1>
      </header>

      <label className={styles.toggle}>
        <span>
          <span className={styles.toggleTitle}>{it.settings.keepOriginal}</span>
          <span className={styles.hint}>{it.settings.keepOriginalHint}</span>
        </span>
        <input
          type="checkbox"
          checked={keep.data}
          onChange={(event) => void settings.set('keepOriginalFile', event.target.checked)}
        />
      </label>

      <section>
        <h2 className={shared.sectionTitle}>{it.settings.disclaimer}</h2>
        <div className={styles.prose}>
          {it.disclaimer.body.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </div>
      </section>

      <p className={styles.footer}>
        {it.settings.version(APP_VERSION)}
        <br />
        {it.settings.more}
      </p>
    </>
  );
}
