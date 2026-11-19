/**
 * Export and share on Android (REQ-EXP-3…6).
 *
 * The file is written to the app's cache directory and then handed to the
 * system share sheet, which is how it reaches Google Drive, email or
 * anywhere else installed — with no cloud credentials in the app
 * (REQ-EXP-5).
 *
 * Cache rather than Documents: the file only exists to be handed over,
 * and the real copy lives wherever the user sends it. Android is free to
 * reclaim the cache afterwards, which is the behaviour we want.
 */

import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import type { ExportFile } from '../core/export';
import type { ShareOutcome, Sharer } from './Sharer';

export class NativeSharer implements Sharer {
  canShareFiles(): boolean {
    return true;
  }

  async share(file: ExportFile): Promise<ShareOutcome> {
    try {
      const written = await Filesystem.writeFile({
        path: file.name,
        data: file.text,
        directory: Directory.Cache,
        encoding: Encoding.UTF8,
        recursive: true,
      });

      await Share.share({
        title: file.name,
        // Android needs a file:// URI the system can grant access to;
        // writeFile returns exactly that.
        url: written.uri,
        dialogTitle: 'Share ride',
      });

      return 'shared';
    } catch (error) {
      // A dismissed share sheet rejects. That is the user changing their
      // mind, not a failure, and must not trigger a fallback.
      if (error instanceof Error && /cancel|abort|dismiss/i.test(error.message)) {
        return 'shared';
      }
      return 'failed';
    }
  }
}
