/**
 * Choosing an export format (REQ-EXP-1, REQ-EXP-2, REQ-SET-6…8).
 */

import type { ExportFormat, Fix, LogMeta } from '../types';
import { GPX_EXTENSION, GPX_MIME, toGpx } from './gpx';
import { KML_EXTENSION, KML_MIME, toKml } from './kml';

export { toGpx, GPX_MIME, GPX_EXTENSION } from './gpx';
export { toKml, KML_MIME, KML_EXTENSION } from './kml';

export interface ExportFile {
  /** File name including extension, e.g. `20261119-0914.gpx` (REQ-EXP-2). */
  name: string;
  /**
   * Correct MIME type matters: a generic one makes some share targets
   * refuse the file or save it under the wrong extension.
   */
  mimeType: string;
  text: string;
  /**
   * Binary content, for formats that are not text (PNG charts, §7.1). When
   * present it is what gets shared; `text` is then unused.
   */
  bytes?: Uint8Array;
}

export function exportLog(
  log: LogMeta,
  fixes: readonly Fix[],
  format: ExportFormat,
): ExportFile {
  if (format === 'kml') {
    return {
      name: `${log.name}.${KML_EXTENSION}`,
      mimeType: KML_MIME,
      text: toKml(log, fixes),
    };
  }
  return {
    name: `${log.name}.${GPX_EXTENSION}`,
    mimeType: GPX_MIME,
    text: toGpx(log, fixes),
  };
}
