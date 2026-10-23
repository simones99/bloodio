// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ServicesProvider, type Services } from '../../src/ui/app/services';
import { SettingsPage } from '../../src/ui/pages/SettingsPage';
import { deliverFile } from '../../src/ui/share/deliver-file';
import { measurementInput, reportInput } from '../storage/helpers';
import { testServices } from './fake-services';
import './setup-dom';

vi.mock('../../src/ui/share/deliver-file', () => ({ deliverFile: vi.fn() }));

beforeEach(() => {
  vi.mocked(deliverFile).mockReset();
});

function renderSettings(services: Services) {
  render(
    <ServicesProvider services={services}>
      <SettingsPage />
    </ServicesProvider>,
  );
}

describe('SettingsPage', () => {
  it('shows the version and promises no future update', async () => {
    renderSettings(await testServices());
    expect(await screen.findByText(/^Versione /)).toBeInTheDocument();
    expect(screen.queryByText(/prossimo aggiornamento/)).not.toBeInTheDocument();
  });

  it('places the app section right after the storage section, before the disclaimer', async () => {
    const services = await testServices();
    renderSettings({
      ...services,
      storage: {
        ...services.storage,
        get: () => Promise.resolve({ persisted: true, usage: 1024 }),
      },
    });
    await screen.findByRole('heading', { name: 'Archivio' });
    await screen.findByRole('heading', { name: 'Uso come app' });
    await vi.waitFor(() => {
      const titles = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
      expect(titles.indexOf('Archivio')).toBeGreaterThanOrEqual(0);
      expect(titles.indexOf('Uso come app')).toBe(titles.indexOf('Archivio') + 1);
      expect(titles.indexOf('Uso come app')).toBeLessThan(
        titles.indexOf('Cosa fa e cosa non fa Bloodio'),
      );
    });
  });
});

describe('SettingsPage: appearance', () => {
  it('starts from Nero and saves the theme picked', async () => {
    const services = await testServices();
    renderSettings(services);
    const carta = await screen.findByRole('radio', { name: 'Carta' });
    expect(screen.getByRole('radio', { name: 'Nero' })).toBeChecked();
    await userEvent.setup().click(carta);
    await vi.waitFor(async () => expect(await services.settings.get('theme')).toBe('carta'));
    await vi.waitFor(() => expect(screen.getByRole('radio', { name: 'Carta' })).toBeChecked());
  });
});

describe('SettingsPage: units', () => {
  it('starts from "as printed" and saves the system picked', async () => {
    const services = await testServices();
    renderSettings(services);
    expect(await screen.findByRole('radio', { name: /^Come sul referto/ })).toBeChecked();
    await userEvent.setup().click(screen.getByRole('radio', { name: /^Sistema internazionale/ }));
    await vi.waitFor(async () => expect(await services.settings.get('unitSystem')).toBe('si'));
  });

  it('resets the units picked for single entries after a confirmation', async () => {
    const services = await testServices();
    await services.settings.set('preferredUnits', { glucose: 'mmol/L', tsh: 'mUI/L' });
    renderSettings(services);
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole('button', {
        name: 'Ripristina le unità scelte per singole voci (2)',
      }),
    );
    expect(screen.getByText('2 voci hanno un’unità scelta a mano. Ripristinarle?')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Ripristina' }));
    await vi.waitFor(async () => expect(await services.settings.get('preferredUnits')).toEqual({}));
    await vi.waitFor(() => {
      expect(screen.queryByRole('button', { name: /Ripristina le unità/ })).not.toBeInTheDocument();
      expect(screen.queryByText(/hanno un’unità scelta a mano/)).not.toBeInTheDocument();
    });
    await vi.waitFor(() =>
      expect(screen.getByRole('radio', { name: 'Come sul referto' })).toHaveFocus(),
    );
  });

  it('moves focus into the confirmation and back to the trigger on cancel', async () => {
    const services = await testServices();
    await services.settings.set('preferredUnits', { glucose: 'mmol/L' });
    renderSettings(services);
    const user = userEvent.setup();
    const trigger = await screen.findByRole('button', { name: /^Ripristina le unità/ });
    await user.click(trigger);
    const cancel = screen.getByRole('button', { name: 'Annulla' });
    expect(cancel).toHaveFocus();
    expect(cancel).toHaveAccessibleDescription(
      'Una voce ha un’unità scelta a mano. Ripristinarla?',
    );
    await user.click(cancel);
    expect(trigger).toBeVisible();
    expect(trigger).toHaveFocus();
    expect(screen.queryByText(/ha un’unità scelta a mano/)).not.toBeInTheDocument();
  });

  it('keeps the confirmation open and says so when the reset cannot be saved', async () => {
    const services = await testServices();
    await services.settings.set('preferredUnits', { glucose: 'mmol/L' });
    const failing: Services = {
      ...services,
      settings: {
        ...services.settings,
        set: (key, value) =>
          key === 'preferredUnits'
            ? Promise.reject(new Error('disk full'))
            : services.settings.set(key, value),
      },
    };
    renderSettings(failing);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /^Ripristina le unità/ }));
    await user.click(screen.getByRole('button', { name: 'Ripristina' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Non sono riuscito a ripristinare le unità. Riprova.',
    );
    expect(screen.getByRole('button', { name: 'Annulla' })).toBeVisible();
    expect(await services.settings.get('preferredUnits')).toEqual({ glucose: 'mmol/L' });
  });

  it('names each choice by its title and describes it with its hint', async () => {
    renderSettings(await testServices());
    const radio = await screen.findByRole('radio', { name: 'Come sul referto' });
    expect(radio).toHaveAccessibleDescription('Ogni valore nell’unità stampata dal laboratorio.');
  });

  it('offers no reset when no entry has its own unit', async () => {
    renderSettings(await testServices());
    await screen.findByRole('radio', { name: /^Come sul referto/ });
    expect(screen.queryByRole('button', { name: /Ripristina le unità/ })).not.toBeInTheDocument();
  });
});

describe('SettingsPage: export', () => {
  it('says there is no export yet', async () => {
    renderSettings(await testServices());
    expect(await screen.findByText('Non hai ancora esportato i tuoi dati.')).toBeInTheDocument();
  });

  it('hands over the file and records the export once it is delivered', async () => {
    vi.mocked(deliverFile).mockResolvedValue('downloaded');
    const services = await testServices();
    await services.reports.saveReport(reportInput(), [measurementInput()]);
    renderSettings(services);
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Esporta i dati' }));

    await vi.waitFor(() => expect(deliverFile).toHaveBeenCalledTimes(1));
    const [blob, name] = vi.mocked(deliverFile).mock.calls[0]!;
    expect(name).toMatch(/^bloodio-\d{4}-\d{2}-\d{2}\.json$/);
    const file = JSON.parse(await blob.text()) as { exportedAt: string };
    expect(file).toMatchObject({ app: 'bloodio', version: 1 });
    expect(await screen.findByText(/^Ultima esportazione:/)).toBeInTheDocument();
    expect(await services.settings.get('lastExportAt')).toBe(file.exportedAt);
  });

  it('announces the backup status', async () => {
    renderSettings(await testServices());
    const status = await screen.findByRole('status');
    await vi.waitFor(() =>
      expect(status).toHaveTextContent('Non hai ancora esportato i tuoi dati.'),
    );
  });

  it('keeps focus on the button and exports once while busy', async () => {
    let finish: (outcome: 'downloaded') => void = () => {};
    vi.mocked(deliverFile).mockReturnValue(new Promise((resolve) => (finish = resolve)));
    const services = await testServices();
    renderSettings(services);
    const user = userEvent.setup();
    const button = await screen.findByRole('button', { name: 'Esporta i dati' });
    await user.click(button);
    await user.click(button);
    await vi.waitFor(() => expect(deliverFile).toHaveBeenCalledTimes(1));

    const busy = await screen.findByRole('button', { name: 'Esportazione…' });
    expect(busy).toHaveAttribute('aria-disabled', 'true');
    expect(busy).toHaveFocus();
    await user.click(busy);
    expect(deliverFile).toHaveBeenCalledTimes(1);

    finish('downloaded');
    await vi.waitFor(async () =>
      expect(await services.settings.get('lastExportAt')).not.toBeNull(),
    );
    expect(await screen.findByRole('button', { name: 'Esporta i dati' })).toHaveFocus();
  });

  it('does not report a failure when the file was delivered but the date could not be saved', async () => {
    vi.mocked(deliverFile).mockResolvedValue('downloaded');
    const services = await testServices();
    renderSettings({
      ...services,
      settings: {
        ...services.settings,
        set: (key, value) =>
          key === 'lastExportAt'
            ? Promise.reject(new Error('disk full'))
            : services.settings.set(key, value),
      },
    });
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Esporta i dati' }));
    await vi.waitFor(() => expect(deliverFile).toHaveBeenCalledTimes(1));
    await screen.findByRole('button', { name: 'Esporta i dati' });
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('does not count a cancelled share as a backup', async () => {
    vi.mocked(deliverFile).mockResolvedValue('cancelled');
    const services = await testServices();
    renderSettings(services);
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Esporta i dati' }));
    await vi.waitFor(() => expect(deliverFile).toHaveBeenCalledTimes(1));
    await screen.findByRole('button', { name: 'Esporta i dati' });
    expect(await services.settings.get('lastExportAt')).toBeNull();
  });

  it('says when data changed after the last export', async () => {
    const services = await testServices();
    await services.settings.set('lastExportAt', '2026-10-01T10:00:00.000Z');
    await services.reports.saveReport(reportInput(), []);
    renderSettings(services);
    expect(
      await screen.findByText(
        'Ultima esportazione: 1 ottobre 2026. Ci sono dati non ancora esportati.',
      ),
    ).toBeInTheDocument();
  });

  it('offers the original files only when there are some, and exports them on request', async () => {
    vi.mocked(deliverFile).mockResolvedValue('downloaded');
    const services = await testServices();
    renderSettings(services);
    await screen.findByRole('button', { name: 'Esporta i dati' });
    expect(screen.queryByRole('checkbox', { name: /Includi i file originali/ })).toBeNull();

    await services.reports.saveReport(
      reportInput(),
      [],
      [{ data: new Uint8Array([1, 2, 3]).buffer, mimeType: 'application/pdf', fileName: 'r.pdf' }],
    );
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole('checkbox', { name: 'Includi i file originali (1, 1 KB)' }),
    );
    await user.click(screen.getByRole('button', { name: 'Esporta i dati' }));
    await vi.waitFor(() => expect(deliverFile).toHaveBeenCalledTimes(1));
    const [blob] = vi.mocked(deliverFile).mock.calls[0]!;
    expect(
      (JSON.parse(await blob.text()) as { data: { attachments: unknown[] } }).data.attachments,
    ).toHaveLength(1);
  });

  it('keeps export and import when the original files cannot be counted', async () => {
    const services = await testServices();
    await services.reports.saveReport(
      reportInput(),
      [],
      [{ data: new Uint8Array([1, 2, 3]).buffer, mimeType: 'application/pdf', fileName: 'r.pdf' }],
    );
    renderSettings({
      ...services,
      reports: {
        ...services.reports,
        attachmentSummary: () => Promise.reject(new Error('blocked')),
      },
    });
    expect(await screen.findByRole('button', { name: 'Esporta i dati' })).toBeInTheDocument();
    expect(screen.getByLabelText('Importa un file')).toBeInTheDocument();
    expect(await screen.findByText('Non hai ancora esportato i tuoi dati.')).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: /Includi i file originali/ })).toBeNull();
  });

  it('keeps export and import with an empty status when the backup state cannot be read', async () => {
    const services = await testServices();
    renderSettings({
      ...services,
      settings: {
        ...services.settings,
        get: (key) =>
          key === 'lastExportAt'
            ? Promise.reject(new Error('blocked'))
            : services.settings.get(key),
      },
    });
    expect(await screen.findByRole('button', { name: 'Esporta i dati' })).toBeInTheDocument();
    expect(screen.getByLabelText('Importa un file')).toBeInTheDocument();
    const section = screen.getByRole('region', { name: 'I tuoi dati' });
    await vi.waitFor(() => expect(within(section).getByRole('status')).toBeEmptyDOMElement());
  });

  it('does not count the original files again when only a setting changes', async () => {
    const services = await testServices();
    const attachmentSummary = vi.fn(services.reports.attachmentSummary);
    renderSettings({ ...services, reports: { ...services.reports, attachmentSummary } });
    await screen.findByRole('button', { name: 'Esporta i dati' });
    await vi.waitFor(() => expect(attachmentSummary).toHaveBeenCalledTimes(1));
    await userEvent.setup().click(await screen.findByRole('radio', { name: 'Carta' }));
    await vi.waitFor(() => expect(screen.getByRole('radio', { name: 'Carta' })).toBeChecked());
    expect(attachmentSummary).toHaveBeenCalledTimes(1);
  });

  it('says so when the export fails', async () => {
    const services = await testServices();
    renderSettings({
      ...services,
      backup: { ...services.backup, exportAll: () => Promise.reject(new Error('quota')) },
    });
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Esporta i dati' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Non sono riuscito a esportare i dati. Riprova.',
    );
  });
});

describe('SettingsPage: import', () => {
  async function backupJson(): Promise<string> {
    const source = await testServices();
    await source.reports.saveReport(reportInput({ sampleDate: '2021-07-10' }), [
      measurementInput(),
    ]);
    await source.reports.saveReport(
      reportInput({ sampleDate: '2022-08-20', lab: 'AST Vallerosa' }),
      [measurementInput(), measurementInput({ analyteId: 'glucose', unit: 'mg/dL' })],
    );
    return JSON.stringify(await source.backup.exportAll());
  }

  async function chooseFile(text: string) {
    const user = userEvent.setup();
    await user.upload(
      await screen.findByLabelText('Importa un file'),
      new File([text], 'bloodio.json', { type: 'application/json' }),
    );
    return user;
  }

  /** The toast, told apart from the backup status that is also a live region. */
  async function findToast() {
    const toast = await screen.findByText(/^Importat/);
    expect(toast).toHaveAttribute('role', 'status');
    return toast;
  }

  it('previews the file and imports it into an empty archive with one button', async () => {
    const services = await testServices();
    renderSettings(services);
    const user = await chooseFile(await backupJson());

    const dialog = await screen.findByRole('dialog', { name: 'Importa i dati' });
    expect(dialog).toHaveTextContent('2 referti, 3 valori');
    expect(dialog).toHaveTextContent('Dal 10 luglio 2021 al 20 agosto 2022');
    expect(dialog).toHaveTextContent('Laboratori: AST Vallerosa, PROAVIS');
    expect(within(dialog).queryByRole('button', { name: 'Sostituisci' })).toBeNull();
    // The dialog moves focus in an effect, which may run after findByRole has seen the dialog.
    await vi.waitFor(() =>
      expect(within(dialog).getByRole('button', { name: 'Annulla' })).toHaveFocus(),
    );

    await user.click(within(dialog).getByRole('button', { name: 'Importa' }));
    expect(await findToast()).toHaveTextContent(/^Importati 2 referti$/);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByLabelText('Importa un file')).toHaveFocus();
    expect(await services.reports.listReports()).toHaveLength(2);
  });

  it('merges by default and says how many reports were already here', async () => {
    const services = await testServices();
    await services.reports.saveReport(reportInput({ sampleDate: '2021-07-10' }), [
      measurementInput(),
    ]);
    renderSettings(services);
    const user = await chooseFile(await backupJson());

    const dialog = await screen.findByRole('dialog', { name: 'Importa i dati' });
    expect(dialog).toHaveTextContent('1 referto è già presente qui.');
    await user.click(within(dialog).getByRole('button', { name: 'Unisci' }));
    expect(await findToast()).toHaveTextContent('Importato 1 referto, 1 già presente');
    expect(await services.reports.listReports()).toHaveLength(2);
  });

  it('replaces only after a second confirmation', async () => {
    const services = await testServices();
    await services.reports.saveReport(reportInput({ sampleDate: '2024-01-01' }), []);
    renderSettings(services);
    const user = await chooseFile(await backupJson());

    await user.click(await screen.findByRole('button', { name: 'Sostituisci' }));
    const dialog = screen.getByRole('alertdialog', { name: 'Sostituire tutti i tuoi dati?' });
    expect(dialog).toHaveAccessibleDescription(
      'Il tuo referto attuale sarà cancellato e sostituito da quelli del file.',
    );
    expect(within(dialog).getByRole('button', { name: 'Annulla' })).toHaveFocus();
    await user.click(within(dialog).getByRole('button', { name: 'Sostituisci tutto' }));
    expect(await findToast()).toHaveTextContent('Importati 2 referti');
    const dates = (await services.reports.listReports()).map((r) => r.sampleDate);
    expect(dates).toEqual(['2022-08-20', '2021-07-10']);
  });

  it('warns that replacing drops the original files when the file has none', async () => {
    const services = await testServices();
    await services.reports.saveReport(
      reportInput({ sampleDate: '2024-01-01' }),
      [],
      [{ data: new Uint8Array([1, 2, 3]).buffer, mimeType: 'application/pdf', fileName: 'r.pdf' }],
    );
    renderSettings(services);
    await screen.findByRole('checkbox', { name: /Includi i file originali/ });
    const user = await chooseFile(await backupJson());

    await user.click(await screen.findByRole('button', { name: 'Sostituisci' }));
    const dialog = screen.getByRole('alertdialog', { name: 'Sostituire tutti i tuoi dati?' });
    const dropsFiles =
      'Anche i file originali conservati su questo dispositivo saranno cancellati: questo file non li contiene.';
    expect(within(dialog).getByText(dropsFiles)).toBeVisible();
    expect(dialog).toHaveAccessibleDescription(
      `Il tuo referto attuale sarà cancellato e sostituito da quelli del file. ${dropsFiles}`,
    );
  });

  it('does not warn about original files when the file carries its own', async () => {
    const services = await testServices();
    await services.reports.saveReport(
      reportInput({ sampleDate: '2024-01-01' }),
      [],
      [{ data: new Uint8Array([1, 2, 3]).buffer, mimeType: 'application/pdf', fileName: 'r.pdf' }],
    );
    const source = await testServices();
    await source.reports.saveReport(
      reportInput({ sampleDate: '2021-07-10' }),
      [measurementInput()],
      [{ data: new Uint8Array([4]).buffer, mimeType: 'application/pdf', fileName: 's.pdf' }],
    );
    const json = JSON.stringify(await source.backup.exportAll({ includeAttachments: true }));
    renderSettings(services);
    await screen.findByRole('checkbox', { name: /Includi i file originali/ });
    const user = await chooseFile(json);

    await user.click(await screen.findByRole('button', { name: 'Sostituisci' }));
    const dialog = screen.getByRole('alertdialog', { name: 'Sostituire tutti i tuoi dati?' });
    expect(dialog).toHaveAccessibleDescription(
      'Il tuo referto attuale sarà cancellato e sostituito da quelli del file.',
    );
  });

  it('goes back from the replace confirmation without importing', async () => {
    const services = await testServices();
    await services.reports.saveReport(reportInput({ sampleDate: '2024-01-01' }), []);
    renderSettings(services);
    const user = await chooseFile(await backupJson());

    await user.click(await screen.findByRole('button', { name: 'Sostituisci' }));
    await user.click(screen.getByRole('button', { name: 'Annulla' }));
    expect(screen.getByRole('button', { name: 'Unisci' })).toBeInTheDocument();
    expect(await services.reports.listReports()).toHaveLength(1);
  });

  it('starts over with the summary when another file is chosen', async () => {
    const services = await testServices();
    await services.reports.saveReport(reportInput({ sampleDate: '2024-01-01' }), []);
    const other = await testServices();
    await other.reports.saveReport(reportInput({ sampleDate: '2023-03-03' }), [measurementInput()]);
    const otherJson = JSON.stringify(await other.backup.exportAll());
    renderSettings(services);
    const user = await chooseFile(await backupJson());

    await user.click(await screen.findByRole('button', { name: 'Sostituisci' }));
    await chooseFile(otherJson);
    const dialog = await screen.findByRole('dialog', { name: 'Importa i dati' });
    await vi.waitFor(() => expect(dialog).toHaveTextContent('1 referto, 1 valore'));
    expect(screen.queryByRole('button', { name: 'Sostituisci tutto' })).toBeNull();
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(await services.reports.listReports()).toHaveLength(1);
  });

  it('ignores a new file while an import is running', async () => {
    const services = await testServices();
    let finish: () => void = () => {};
    const applyImport = vi.fn<typeof services.backup.applyImport>(
      (raw, mode) =>
        new Promise((resolve, reject) => {
          finish = () => void services.backup.applyImport(raw, mode).then(resolve, reject);
        }),
    );
    const previewImport = vi.fn(services.backup.previewImport);
    renderSettings({ ...services, backup: { ...services.backup, applyImport, previewImport } });
    const user = await chooseFile(await backupJson());

    await user.click(await screen.findByRole('button', { name: 'Importa' }));
    await vi.waitFor(() =>
      expect(screen.getByText('Importa un file')).toHaveAttribute('aria-disabled', 'true'),
    );
    await chooseFile(JSON.stringify({ app: 'bloodio', version: 1 }));
    expect(previewImport).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole('dialog', { name: 'Importa i dati' })).toHaveTextContent(
      '2 referti, 3 valori',
    );

    finish();
    expect(await findToast()).toHaveTextContent('Importati 2 referti');
    expect(screen.getByText('Importa un file')).not.toHaveAttribute('aria-disabled');
  });

  it('closes on Escape when idle and ignores it while importing', async () => {
    const services = await testServices();
    let finish: () => void = () => {};
    const applyImport = vi.fn<typeof services.backup.applyImport>(
      (raw, mode) =>
        new Promise((resolve, reject) => {
          finish = () => void services.backup.applyImport(raw, mode).then(resolve, reject);
        }),
    );
    renderSettings({ ...services, backup: { ...services.backup, applyImport } });
    const json = await backupJson();
    const user = await chooseFile(json);

    await screen.findByRole('dialog', { name: 'Importa i dati' });
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();

    await chooseFile(json);
    await user.click(await screen.findByRole('button', { name: 'Importa' }));
    await user.keyboard('{Escape}');
    expect(screen.getByRole('dialog', { name: 'Importa i dati' })).toBeInTheDocument();

    finish();
    expect(await findToast()).toHaveTextContent('Importati 2 referti');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('keeps the local data when a replace fails', async () => {
    const services = await testServices();
    await services.reports.saveReport(reportInput({ sampleDate: '2024-01-01' }), []);
    renderSettings({
      ...services,
      backup: { ...services.backup, applyImport: () => Promise.reject(new Error('quota')) },
    });
    const user = await chooseFile(await backupJson());

    await user.click(await screen.findByRole('button', { name: 'Sostituisci' }));
    await user.click(screen.getByRole('button', { name: 'Sostituisci tutto' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Importazione non riuscita. I tuoi dati non sono cambiati.',
    );
    const dates = (await services.reports.listReports()).map((r) => r.sampleDate);
    expect(dates).toEqual(['2024-01-01']);
  });

  it('does not call reports "already here" when the archive is empty', async () => {
    const services = await testServices();
    renderSettings({
      ...services,
      backup: {
        ...services.backup,
        previewImport: async (raw) => ({
          ...(await services.backup.previewImport(raw)),
          duplicates: 1,
        }),
      },
    });
    await chooseFile(await backupJson());
    const dialog = await screen.findByRole('dialog', { name: 'Importa i dati' });
    expect(dialog).toHaveTextContent('2 referti, 3 valori');
    expect(dialog).not.toHaveTextContent('già presente');
  });

  it('closes on cancel and gives focus back to the file field', async () => {
    const services = await testServices();
    renderSettings(services);
    const user = await chooseFile(await backupJson());

    await user.click(await screen.findByRole('button', { name: 'Annulla' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByLabelText('Importa un file')).toHaveFocus();
    expect(await services.reports.listReports()).toHaveLength(0);
  });

  it('keeps focus on the pressed button and imports once while busy', async () => {
    const services = await testServices();
    let finish: () => void = () => {};
    const applyImport = vi.fn<typeof services.backup.applyImport>(
      (raw, mode) =>
        new Promise((resolve, reject) => {
          finish = () => void services.backup.applyImport(raw, mode).then(resolve, reject);
        }),
    );
    renderSettings({ ...services, backup: { ...services.backup, applyImport } });
    const user = await chooseFile(await backupJson());

    const button = await screen.findByRole('button', { name: 'Importa' });
    await user.click(button);
    expect(button).toHaveAttribute('aria-disabled', 'true');
    expect(button).toHaveFocus();
    await user.click(button);
    expect(applyImport).toHaveBeenCalledTimes(1);

    finish();
    expect(await findToast()).toHaveTextContent('Importati 2 referti');
    expect(await services.reports.listReports()).toHaveLength(2);
  });

  it('says when the file is not JSON', async () => {
    renderSettings(await testServices());
    await chooseFile('nope');
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Questo file non è un export di Bloodio.',
    );
  });

  it('says when the file comes from a newer app', async () => {
    renderSettings(await testServices());
    await chooseFile(JSON.stringify({ app: 'bloodio', version: 99 }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Questo file viene da una versione più recente di Bloodio.',
    );
  });

  it('lists the first problems of an invalid file', async () => {
    renderSettings(await testServices());
    await chooseFile(JSON.stringify({ app: 'bloodio', version: 1 }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Il file non è valido.');
    expect(within(alert).getByText('Dettagli')).toBeInTheDocument();
    // The list sits in a closed <details>: count it even if treated as hidden.
    const issues = within(alert).getAllByRole('listitem', { hidden: true });
    expect(issues.length).toBeGreaterThan(0);
    expect(issues.length).toBeLessThanOrEqual(5);
  });

  it('keeps the data and says so when the import fails', async () => {
    const services = await testServices();
    renderSettings({
      ...services,
      backup: { ...services.backup, applyImport: () => Promise.reject(new Error('quota')) },
    });
    const user = await chooseFile(await backupJson());
    await user.click(await screen.findByRole('button', { name: 'Importa' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Importazione non riuscita. I tuoi dati non sono cambiati.',
    );
    expect(await services.reports.listReports()).toHaveLength(0);
  });
});

describe('SettingsPage: storage', () => {
  function withStorage(
    services: Services,
    state: { persisted: boolean | null; usage: number | null },
  ) {
    const requestPersist = vi.fn(() => Promise.resolve(true));
    return {
      requestPersist,
      services: { ...services, storage: { get: () => Promise.resolve(state), requestPersist } },
    };
  }

  it('says the archive is protected and how much space it uses', async () => {
    const { services } = withStorage(await testServices(), { persisted: true, usage: 1258291 });
    renderSettings(services);
    expect(
      await screen.findByText('Archivio protetto: il browser non cancella i dati da solo.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Spazio usato: 1,2 MB')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Proteggi l’archivio' })).toBeNull();
  });

  it('asks the browser to protect an unprotected archive and moves focus to the status', async () => {
    const { services, requestPersist } = withStorage(await testServices(), {
      persisted: false,
      usage: null,
    });
    renderSettings(services);
    await userEvent
      .setup()
      .click(await screen.findByRole('button', { name: 'Proteggi l’archivio' }));
    expect(requestPersist).toHaveBeenCalledTimes(1);
    const status = await screen.findByText(
      'Archivio protetto: il browser non cancella i dati da solo.',
    );
    expect(status).toHaveAttribute('role', 'status');
    // The button is gone: focus moves to the new status instead of dropping to the body.
    await vi.waitFor(() => expect(document.activeElement).toBe(status));
    expect(screen.queryByText(/^Spazio usato/)).toBeNull();
  });

  it('keeps the button and its focus when the browser refuses', async () => {
    const { services, requestPersist } = withStorage(await testServices(), {
      persisted: false,
      usage: null,
    });
    requestPersist.mockResolvedValue(false);
    renderSettings(services);
    const button = await screen.findByRole('button', { name: 'Proteggi l’archivio' });
    await userEvent.setup().click(button);
    await vi.waitFor(() => expect(requestPersist).toHaveBeenCalledTimes(1));
    expect(button).toBeInTheDocument();
    expect(document.activeElement).toBe(button);
  });

  it('shows nothing when the browser does not say', async () => {
    const { services } = withStorage(await testServices(), { persisted: null, usage: null });
    renderSettings(services);
    await screen.findByRole('button', { name: 'Esporta i dati' });
    expect(screen.queryByRole('heading', { name: 'Archivio' })).toBeNull();
  });
});

describe('SettingsPage: delete everything', () => {
  async function withData() {
    const services = await testServices();
    await services.reports.saveReport(reportInput(), [measurementInput(), measurementInput()]);
    return services;
  }

  /** Stops Date.now() where it is; the returned function moves it forward. */
  function freezeClock() {
    let now = Date.now();
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    return (ms: number) => {
      now += ms;
    };
  }

  /** Moves the clock past the final step's guard against double taps. */
  function later() {
    freezeClock()(600);
  }

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('deletes only after two steps, then restarts the app', async () => {
    const services = await withData();
    const restart = vi.fn();
    renderSettings({ ...services, restart });
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Elimina tutti i dati' }));
    const dialog = screen.getByRole('alertdialog', { name: 'Eliminare tutti i dati?' });
    expect(await within(dialog).findByText(/^1 referto, 2 valori, i file originali/)).toBeVisible();
    await user.click(within(dialog).getByRole('button', { name: 'Continua' }));
    expect(restart).not.toHaveBeenCalled();
    later();
    await user.click(screen.getByRole('button', { name: 'Elimina definitivamente' }));

    await vi.waitFor(() => expect(restart).toHaveBeenCalledTimes(1));
    expect(await services.reports.listReports()).toEqual([]);
  });

  it('cancels from either step and keeps the data', async () => {
    const services = await withData();
    renderSettings(services);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Elimina tutti i dati' }));
    await user.click(screen.getByRole('button', { name: 'Continua' }));
    await user.click(screen.getByRole('button', { name: 'Annulla' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(await services.reports.listReports()).toHaveLength(1);
  });

  it('offers to export first when some data were never exported', async () => {
    vi.mocked(deliverFile).mockResolvedValue('downloaded');
    renderSettings(await withData());
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Elimina tutti i dati' }));
    await user.click(await screen.findByRole('button', { name: 'Esporta prima' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    await vi.waitFor(() => expect(deliverFile).toHaveBeenCalledTimes(1));
  });

  it('offers to export first when the device holds original files, even after an export', async () => {
    const services = await testServices();
    await services.reports.saveReport(
      reportInput(),
      [],
      [{ data: new Uint8Array([1, 2, 3]).buffer, mimeType: 'application/pdf', fileName: 'r.pdf' }],
    );
    // An export after the last change: nothing is pending, but that file may lack the originals.
    await services.settings.set('lastExportAt', '2999-01-01T00:00:00.000Z');
    renderSettings(services);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Elimina tutti i dati' }));
    await screen.findByText(/^1 referto, 0 valori/);
    expect(await screen.findByRole('button', { name: 'Esporta prima' })).toBeInTheDocument();
  });

  it('does not offer to export first when everything was exported and there are no files', async () => {
    const services = await withData();
    await services.settings.set('lastExportAt', '2999-01-01T00:00:00.000Z');
    renderSettings(services);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Elimina tutti i dati' }));
    await screen.findByText(/^1 referto, 2 valori/);
    expect(screen.queryByRole('button', { name: 'Esporta prima' })).toBeNull();
  });

  it('does not offer to export first when there is nothing to save', async () => {
    renderSettings(await testServices());
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Elimina tutti i dati' }));
    await screen.findByText(/^0 referti, 0 valori/);
    expect(screen.queryByRole('button', { name: 'Esporta prima' })).toBeNull();
  });

  it('keeps the data and says so when deleting fails', async () => {
    const services = await withData();
    const restart = vi.fn();
    renderSettings({
      ...services,
      restart,
      backup: { ...services.backup, wipeAll: () => Promise.reject(new Error('blocked')) },
    });
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Elimina tutti i dati' }));
    await user.click(screen.getByRole('button', { name: 'Continua' }));
    later();
    await user.click(screen.getByRole('button', { name: 'Elimina definitivamente' }));
    const dialog = screen.getByRole('alertdialog');
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Eliminazione non riuscita. I tuoi dati sono ancora qui.',
    );
    expect(restart).not.toHaveBeenCalled();
    expect(await services.reports.listReports()).toHaveLength(1);
  });

  it('announces each step and moves focus to its Annulla', async () => {
    renderSettings(await withData());
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Elimina tutti i dati' }));
    const first = screen.getByRole('alertdialog', { name: 'Eliminare tutti i dati?' });
    await vi.waitFor(() =>
      expect(within(first).getByRole('button', { name: 'Annulla' })).toHaveFocus(),
    );
    // Focus moves at once; the counts in the description come from a query that may still run.
    await vi.waitFor(() =>
      expect(first).toHaveAccessibleDescription(/^1 referto, 2 valori, i file originali/),
    );

    await user.click(within(first).getByRole('button', { name: 'Continua' }));
    const second = screen.getByRole('alertdialog', { name: 'Ultima conferma' });
    // A new dialog element, so screen readers announce the new title and body.
    expect(second).not.toBe(first);
    expect(second).toHaveAccessibleDescription(
      'Tutti i dati di Bloodio su questo dispositivo spariscono adesso.',
    );
    expect(within(second).getByRole('button', { name: 'Annulla' })).toHaveFocus();
  });

  it('returns focus to the trigger when cancelled', async () => {
    renderSettings(await withData());
    const user = userEvent.setup();
    const trigger = await screen.findByRole('button', { name: 'Elimina tutti i dati' });
    await user.click(trigger);
    await user.click(screen.getByRole('button', { name: 'Continua' }));
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(trigger).toBeVisible();
    expect(document.activeElement).toBe(trigger);
  });

  it('returns focus to the trigger after "Esporta prima"', async () => {
    vi.mocked(deliverFile).mockResolvedValue('downloaded');
    renderSettings(await withData());
    const user = userEvent.setup();
    const trigger = await screen.findByRole('button', { name: 'Elimina tutti i dati' });
    await user.click(trigger);
    await user.click(await screen.findByRole('button', { name: 'Esporta prima' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(trigger).toBeVisible();
    expect(document.activeElement).toBe(trigger);
    await vi.waitFor(() => expect(deliverFile).toHaveBeenCalledTimes(1));
  });

  it('keeps "Esporta prima" and "Continua" focusable but inert while an export runs', async () => {
    vi.mocked(deliverFile).mockReturnValue(new Promise(() => {}));
    renderSettings(await withData());
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Esporta i dati' }));
    await screen.findByRole('button', { name: 'Esportazione…' });
    await user.click(screen.getByRole('button', { name: 'Elimina tutti i dati' }));
    const exportFirst = await screen.findByRole('button', { name: 'Esporta prima' });
    expect(exportFirst).toHaveAttribute('aria-disabled', 'true');
    expect(exportFirst).toBeEnabled();
    await user.click(exportFirst);
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    expect(deliverFile).toHaveBeenCalledTimes(1);

    const next = screen.getByRole('button', { name: 'Continua' });
    expect(next).toHaveAttribute('aria-disabled', 'true');
    expect(next).toBeEnabled();
    await user.click(next);
    expect(screen.getByRole('alertdialog', { name: 'Eliminare tutti i dati?' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Elimina definitivamente' })).toBeNull();
  });

  it('moves focus into the dialog at once, before the counts load', async () => {
    const services = await withData();
    renderSettings({
      ...services,
      reports: { ...services.reports, listReportSummaries: () => new Promise(() => {}) },
    });
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Elimina tutti i dati' }));
    const dialog = screen.getByRole('alertdialog', { name: 'Eliminare tutti i dati?' });
    expect(dialog.contains(document.activeElement)).toBe(true);
    expect(within(dialog).getByRole('button', { name: 'Annulla' })).toHaveFocus();
  });

  it('ignores a tap on the final button right after "Continua"', async () => {
    const services = await withData();
    const wipeAll = vi.fn(() => Promise.resolve());
    renderSettings({ ...services, backup: { ...services.backup, wipeAll } });
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Elimina tutti i dati' }));
    const advance = freezeClock();
    await user.click(screen.getByRole('button', { name: 'Continua' }));
    const confirm = screen.getByRole('button', { name: 'Elimina definitivamente' });
    await user.click(confirm);
    advance(599);
    await user.click(confirm);
    expect(wipeAll).not.toHaveBeenCalled();
    advance(1);
    await user.click(confirm);
    expect(wipeAll).toHaveBeenCalledTimes(1);
  });

  it('describes the deletion without counts when they cannot be read', async () => {
    vi.mocked(deliverFile).mockResolvedValue('downloaded');
    const services = await withData();
    renderSettings({
      ...services,
      reports: {
        ...services.reports,
        listReportSummaries: () => Promise.reject(new Error('blocked')),
      },
    });
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Elimina tutti i dati' }));
    const dialog = screen.getByRole('alertdialog', { name: 'Eliminare tutti i dati?' });
    const generic =
      'Tutti i referti, i valori, i file originali, le voci personalizzate e le impostazioni. Non si può annullare.';
    expect(await within(dialog).findByText(generic)).toBeVisible();
    expect(dialog).toHaveAccessibleDescription(generic);
    await user.click(within(dialog).getByRole('button', { name: 'Esporta prima' }));
    await vi.waitFor(() => expect(deliverFile).toHaveBeenCalledTimes(1));
  });

  it('deletes once and cannot be cancelled while deleting', async () => {
    const services = await withData();
    let finish: () => void = () => {};
    const wipeAll = vi.fn(() => new Promise<void>((resolve) => (finish = resolve)));
    const restart = vi.fn();
    renderSettings({ ...services, restart, backup: { ...services.backup, wipeAll } });
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Elimina tutti i dati' }));
    await user.click(screen.getByRole('button', { name: 'Continua' }));
    const confirm = screen.getByRole('button', { name: 'Elimina definitivamente' });
    later();
    await user.click(confirm);
    await user.click(confirm);
    expect(wipeAll).toHaveBeenCalledTimes(1);
    expect(confirm).toHaveAttribute('aria-disabled', 'true');
    expect(confirm).toHaveFocus();

    await user.keyboard('{Escape}');
    await user.click(screen.getByRole('button', { name: 'Annulla' }));
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();

    finish();
    await vi.waitFor(() => expect(restart).toHaveBeenCalledTimes(1));
  });
});
