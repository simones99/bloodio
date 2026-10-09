export type DeliveryOutcome = 'shared' | 'downloaded' | 'cancelled';

function canShareFile(file: File): boolean {
  return (
    typeof matchMedia === 'function' &&
    matchMedia('(pointer: coarse)').matches &&
    typeof navigator.canShare === 'function' &&
    navigator.canShare({ files: [file] })
  );
}

/**
 * Hands a file to the user. Shares it only where the primary pointer is touch (`pointer: coarse`)
 * and the platform accepts the file; desktop browsers also report canShare but a share sheet is
 * the wrong UX there, so they download. If the system refuses the share (NotAllowedError, e.g.
 * iOS transient activation lapsed during async work) it falls back to a download.
 * Nothing leaves the device unless the user picks a destination in the share sheet.
 */
export async function deliverFile(
  blob: Blob,
  fileName: string,
  title: string,
): Promise<DeliveryOutcome> {
  const file = new File([blob], fileName, { type: blob.type });
  if (canShareFile(file)) {
    try {
      await navigator.share({ files: [file], title });
      return 'shared';
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled';
      if (!(error instanceof DOMException && error.name === 'NotAllowedError')) throw error;
    }
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  // Safari may show a download prompt; keep the URL valid until the user has had time to answer.
  setTimeout(() => URL.revokeObjectURL(url), 40_000);
  return 'downloaded';
}
