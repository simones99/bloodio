import { useCallback } from 'react';
import { APP_VERSION } from '../../version';
import { useServices } from '../app/services';
import { useQuery } from '../app/use-query';
import { it } from '../i18n/it';
import { DataSection } from '../settings/DataSection';
import { AppSection } from '../settings/AppSection';
import { StorageSection } from '../settings/StorageSection';
import { ThemeSection } from '../settings/ThemeSection';
import { UnitsSection } from '../settings/UnitsSection';
import { useExport } from '../app/use-export';
import { WipeSection } from '../settings/WipeSection';
import shared from '../styles/shared.module.css';
import styles from './SettingsPage.module.css';

export function SettingsPage() {
  const { settings } = useServices();
  // One exporter for the page: the delete dialog's "Esporta prima" reuses it.
  const exporter = useExport();
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

      <ThemeSection />
      <UnitsSection />

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

      <DataSection exporter={exporter} />
      <StorageSection />
      <AppSection />

      <section>
        <h2 className={shared.sectionTitle}>{it.settings.disclaimer}</h2>
        <div className={styles.prose}>
          {it.disclaimer.body.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </div>
      </section>

      <WipeSection exporter={exporter} />

      <p className={styles.footer}>{it.settings.version(APP_VERSION)}</p>
    </>
  );
}
