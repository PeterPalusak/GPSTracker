/**
 * A sharer driven by tests.
 *
 * Records what was handed to it, so the export path can be verified
 * without a share sheet or a DOM.
 */

import type { ExportFile } from '../core/export';
import type { ShareOutcome, Sharer } from './Sharer';

export class FakeSharer implements Sharer {
  readonly shared: ExportFile[] = [];
  outcome: ShareOutcome = 'shared';
  supportsFiles = true;

  canShareFiles(): boolean {
    return this.supportsFiles;
  }

  async share(file: ExportFile): Promise<ShareOutcome> {
    this.shared.push(file);
    return this.supportsFiles ? this.outcome : 'downloaded';
  }

  get last(): ExportFile | undefined {
    return this.shared[this.shared.length - 1];
  }
}
