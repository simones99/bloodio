import { useState } from 'react';
import { it } from '../i18n/it';
import shared from '../styles/shared.module.css';
import styles from './settings.module.css';
import type { Exporter } from '../app/use-export';
import { WipeDialog } from './WipeDialog';

export function WipeSection({ exporter }: { exporter: Exporter }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={styles.danger}>
      {/* Kept mounted (just hidden) while the dialog is open, so closing it can restore focus here. */}
      <button
        type="button"
        className={shared.textButton}
        hidden={open}
        onClick={() => setOpen(true)}
      >
        {it.settings.wipe.action}
      </button>
      {open && <WipeDialog exporter={exporter} onClose={() => setOpen(false)} />}
    </div>
  );
}
