/**
 * A location source driven by tests.
 *
 * Lives in `src` rather than a test folder so the recorder tests and, later,
 * a developer "simulate a ride" mode can share it.
 */

import type {
  LocationErrorKind,
  LocationSource,
  LocationSourceHandlers,
  RawFix,
} from './LocationSource';

export class FakeLocationSource implements LocationSource {
  readonly kind = 'fake';
  private handlers: LocationSourceHandlers | null = null;

  /** How many times start() has been called — Pause/Re-Start cycles. */
  startCount = 0;
  stopCount = 0;

  get running(): boolean {
    return this.handlers !== null;
  }

  async start(handlers: LocationSourceHandlers): Promise<void> {
    this.handlers = handlers;
    this.startCount += 1;
  }

  async stop(): Promise<void> {
    this.handlers = null;
    this.stopCount += 1;
  }

  /** Deliver a batch, as a native background provider might (REQ-PLAT-6). */
  emit(fixes: readonly RawFix[]): void {
    this.handlers?.onFixes(fixes);
  }

  emitOne(fix: RawFix): void {
    this.emit([fix]);
  }

  emitError(error: LocationErrorKind): void {
    this.handlers?.onError(error);
  }
}
