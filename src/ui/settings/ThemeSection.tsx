import { useCallback } from 'react';
import { useServices } from '../app/services';
import { useQuery } from '../app/use-query';
import { it } from '../i18n/it';
import { ChoiceGroup } from './ChoiceGroup';
import styles from './settings.module.css';

/** Nero, Carta or automatic. main.tsx applies the saved theme (syncTheme). */
export function ThemeSection() {
  const { settings } = useServices();
  const theme = useQuery(
    useCallback(() => settings.get('theme'), [settings]),
    settings.subscribe,
  );
  if (theme.status !== 'ready') return null;

  const t = it.settings.theme;
  return (
    <section className={styles.section}>
      <ChoiceGroup
        legend={t.title}
        name="theme"
        value={theme.data}
        choices={[
          { value: 'nero', label: t.nero, hint: t.neroHint },
          { value: 'carta', label: t.carta, hint: t.cartaHint },
          { value: 'auto', label: t.auto, hint: t.autoHint },
        ]}
        onChange={(value) => void settings.set('theme', value)}
      />
    </section>
  );
}
