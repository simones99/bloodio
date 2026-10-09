import { useCallback, useEffect, useRef, useState } from 'react';
import { useServices } from '../app/services';
import { useQuery } from '../app/use-query';
import { it } from '../i18n/it';
import shared from '../styles/shared.module.css';
import { ChoiceGroup } from './ChoiceGroup';
import styles from './settings.module.css';

/** The unit system, and a reset for the units picked entry by entry on the entry pages. */
export function UnitsSection() {
  const { settings } = useServices();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const section = useRef<HTMLElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const cancelButton = useRef<HTMLButtonElement>(null);
  const wasConfirming = useRef(false);
  const loaded = useQuery(
    useCallback(
      async () => ({
        system: await settings.get('unitSystem'),
        preferred: await settings.get('preferredUnits'),
      }),
      [settings],
    ),
    settings.subscribe,
  );
  const perEntry = loaded.status === 'ready' ? Object.keys(loaded.data.preferred).length : 0;

  // Once the reset has been saved and reloaded, nothing is left to confirm.
  useEffect(() => {
    if (confirming && loaded.status === 'ready' && perEntry === 0) setConfirming(false);
  }, [confirming, loaded.status, perEntry]);

  // Focus follows the confirmation: into it when it opens, back out to the trigger when it
  // closes (or to the checked unit system when the trigger is gone because the reset worked).
  useEffect(() => {
    if (confirming) {
      cancelButton.current?.focus();
    } else if (wasConfirming.current) {
      const target =
        trigger.current ?? section.current?.querySelector<HTMLInputElement>('input:checked');
      target?.focus();
    }
    wasConfirming.current = confirming;
  }, [confirming]);

  if (loaded.status !== 'ready') return null;

  const u = it.settings.units;
  const cancel = () => {
    setError(null);
    setConfirming(false);
  };
  return (
    <section ref={section} className={styles.section}>
      <ChoiceGroup
        legend={u.title}
        name="unit-system"
        value={loaded.data.system}
        choices={[
          { value: 'printed', label: u.printed, hint: u.printedHint },
          { value: 'conventional', label: u.conventional, hint: u.conventionalHint },
          { value: 'si', label: u.si, hint: u.siHint },
        ]}
        onChange={(value) => void settings.set('unitSystem', value)}
      />
      {perEntry > 0 && (
        <div className={styles.body}>
          {/* Kept mounted (just hidden) while confirming, so cancelling can return focus here. */}
          <button
            ref={trigger}
            type="button"
            className={shared.textButton}
            hidden={confirming}
            onClick={() => setConfirming(true)}
          >
            {u.resetPerEntry(perEntry)}
          </button>
          {confirming && (
            <>
              <p id="units-reset-question" className={styles.status}>
                {u.resetConfirm(perEntry)}
              </p>
              <div className={styles.actions}>
                <button
                  ref={cancelButton}
                  type="button"
                  className={shared.secondary}
                  aria-describedby="units-reset-question"
                  onClick={cancel}
                >
                  {u.cancel}
                </button>
                <button
                  type="button"
                  className={shared.secondary}
                  onClick={async () => {
                    setError(null);
                    try {
                      await settings.set('preferredUnits', {});
                    } catch {
                      setError(u.resetFailed);
                    }
                  }}
                >
                  {u.resetDo}
                </button>
              </div>
              {error && (
                <p className={shared.alert} role="alert">
                  {error}
                </p>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}
