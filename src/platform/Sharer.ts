/**
 * Handing an exported file to the operating system (REQ-EXP-3…6).
 *
 * The share sheet is how the file reaches Google Drive, OneDrive,
 * Dropbox, email or local storage — without the app holding any cloud
 * credentials or integrating with any provider's API (REQ-EXP-5).
 */

import type { ExportFile } from '../core/export';

export type ShareOutcome =
  /** Handed to the OS share sheet. Whether the user saved it is unknowable. */
  | 'shared'
  /** Share unavailable, so the file was downloaded instead (REQ-EXP-6). */
  | 'downloaded'
  | 'failed';

export interface Sharer {
  /** Whether the share sheet can accept files on this platform. */
  canShareFiles(file: ExportFile): boolean;
  share(file: ExportFile): Promise<ShareOutcome>;
}

export class WebSharer implements Sharer {
  canShareFiles(file: ExportFile): boolean {
    if (typeof navigator === 'undefined' || !navigator.canShare || !navigator.share) {
      return false;
    }
    try {
      // The files capability is separate from basic share support, so
      // probing with an actual File is the only reliable check.
      return navigator.canShare({ files: [this.toFile(file)] });
    } catch {
      return false;
    }
  }

  /**
   * Share, falling back to a download.
   *
   * Must be called from within a user gesture: the file content has to be
   * ready before this point, because an await in between can lose the
   * gesture and make the share sheet refuse to open.
   */
  async share(file: ExportFile): Promise<ShareOutcome> {
    if (this.canShareFiles(file)) {
      try {
        await navigator.share({ files: [this.toFile(file)], title: file.name });
        return 'shared';
      } catch (error) {
        // AbortError means the user dismissed the sheet — not a failure,
        // and not something to fall back from.
        if (error instanceof DOMException && error.name === 'AbortError') return 'shared';
        return this.download(file);
      }
    }
    return this.download(file);
  }

  private toFile(file: ExportFile): File {
    return new File([file.text], file.name, { type: file.mimeType });
  }

  private download(file: ExportFile): ShareOutcome {
    try {
      const blob = new Blob([file.text], { type: file.mimeType });
      const url = URL.createObjectURL(blob);

      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = file.name;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();

      // Revoked on a later turn of the event loop: revoking immediately
      // can cancel the download in some browsers.
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      return 'downloaded';
    } catch {
      return 'failed';
    }
  }
}
