import { describe, expect, it } from 'vitest';
import {
  ACQUISITION_ACCURACY_M,
  AcquisitionGate,
  looksLikeSatelliteFix,
} from './acquisition';
import type { RawFix } from '../platform/LocationSource';

function fix(overrides: Partial<RawFix> = {}): RawFix {
  return {
    t: 0,
    lat: 48,
    lon: 17,
    alt: null,
    acc: null,
    spd: null,
    hdg: null,
    satellites: null,
    provider: null,
    ...overrides,
  };
}

describe('looksLikeSatelliteFix', () => {
  describe('satellite count, where the platform reports it', () => {
    it('accepts four or more satellites', () => {
      expect(looksLikeSatelliteFix(fix({ satellites: 4 }))).toBe(true);
      expect(looksLikeSatelliteFix(fix({ satellites: 11 }))).toBe(true);
    });

    it('rejects fewer than four, even with a tight accuracy', () => {
      // Three satellites cannot give a 3-D fix; a plausible accuracy
      // alongside that is not evidence of one.
      expect(looksLikeSatelliteFix(fix({ satellites: 3, acc: 5 }))).toBe(false);
      expect(looksLikeSatelliteFix(fix({ satellites: 0, acc: 5 }))).toBe(false);
    });

    it('outranks every other signal', () => {
      expect(looksLikeSatelliteFix(fix({ satellites: 2, alt: 300, acc: 4 }))).toBe(false);
    });
  });

  describe('provider name, where the platform reports it', () => {
    it('accepts gps', () => {
      expect(looksLikeSatelliteFix(fix({ provider: 'gps', acc: 500 }))).toBe(true);
    });

    it('rejects network', () => {
      expect(looksLikeSatelliteFix(fix({ provider: 'network', acc: 5 }))).toBe(false);
    });

    it('falls through on fused, which blends sources and proves nothing', () => {
      expect(looksLikeSatelliteFix(fix({ provider: 'fused', alt: 212 }))).toBe(true);
      expect(looksLikeSatelliteFix(fix({ provider: 'fused', acc: 900 }))).toBe(false);
    });
  });

  describe('altitude, the web build′s strongest signal', () => {
    it('accepts any non-null altitude', () => {
      // Wi-Fi and cell positioning are 2-D and cannot produce one.
      expect(looksLikeSatelliteFix(fix({ alt: 212.4, acc: 60 }))).toBe(true);
    });

    it('accepts sea level, which is a real altitude', () => {
      expect(looksLikeSatelliteFix(fix({ alt: 0, acc: 60 }))).toBe(true);
    });

    it('accepts a negative altitude', () => {
      expect(looksLikeSatelliteFix(fix({ alt: -8, acc: 60 }))).toBe(true);
    });
  });

  describe('accuracy fallback', () => {
    it('accepts accuracy at or under the bound', () => {
      expect(looksLikeSatelliteFix(fix({ acc: ACQUISITION_ACCURACY_M }))).toBe(true);
      expect(looksLikeSatelliteFix(fix({ acc: 8 }))).toBe(true);
    });

    it('rejects accuracy above the bound', () => {
      expect(looksLikeSatelliteFix(fix({ acc: ACQUISITION_ACCURACY_M + 1 }))).toBe(false);
    });

    it('rejects typical Wi-Fi and cell-tower accuracies', () => {
      expect(looksLikeSatelliteFix(fix({ acc: 65 }))).toBe(false);
      expect(looksLikeSatelliteFix(fix({ acc: 1_200 }))).toBe(false);
      expect(looksLikeSatelliteFix(fix({ acc: 20_000 }))).toBe(false);
    });

    it('rejects a fix carrying no usable signal at all', () => {
      expect(looksLikeSatelliteFix(fix())).toBe(false);
    });
  });
});

describe('AcquisitionGate', () => {
  it('starts closed', () => {
    expect(new AcquisitionGate().acquired).toBe(false);
  });

  it('needs two consecutive qualifying fixes', () => {
    const gate = new AcquisitionGate();
    const first = fix({ alt: 200 });
    const second = fix({ alt: 201 });

    expect(gate.consider(first)).toEqual([]);
    expect(gate.acquired).toBe(false);

    // Both are released at the moment of acquisition — the held-back fix
    // is a real satellite fix and belongs in the track.
    expect(gate.consider(second)).toEqual([first, second]);
    expect(gate.acquired).toBe(true);
  });

  it('releases only the current fix once already open', () => {
    const gate = new AcquisitionGate();
    gate.consider(fix({ alt: 200 }));
    gate.consider(fix({ alt: 201 }));

    const later = fix({ alt: 202 });
    expect(gate.consider(later)).toEqual([later]);
  });

  it('does not open on a single plausible-looking fix', () => {
    // One good Wi-Fi fix among poor ones must not start the recording.
    const gate = new AcquisitionGate();
    gate.consider(fix({ acc: 2_000 }));
    gate.consider(fix({ acc: 10 }));
    gate.consider(fix({ acc: 2_000 }));
    expect(gate.acquired).toBe(false);
  });

  it('requires the qualifying fixes to be consecutive', () => {
    const gate = new AcquisitionGate();
    gate.consider(fix({ acc: 10 }));
    gate.consider(fix({ acc: 900 })); // breaks the run
    gate.consider(fix({ acc: 10 }));
    expect(gate.acquired).toBe(false);

    gate.consider(fix({ acc: 10 }));
    expect(gate.acquired).toBe(true);
  });

  it('stays open once acquired, whatever follows', () => {
    // The gate is for acquisition, never for filtering (trap T2 accepted).
    const gate = new AcquisitionGate();
    gate.consider(fix({ alt: 200 }));
    gate.consider(fix({ alt: 201 }));

    expect(gate.consider(fix({ acc: 5_000 }))).toHaveLength(1);
    expect(gate.consider(fix())).toHaveLength(1);
    expect(gate.acquired).toBe(true);
  });

  it('discards the buffered run when a poor fix breaks it', () => {
    const gate = new AcquisitionGate();
    gate.consider(fix({ acc: 10 }));
    expect(gate.consider(fix({ acc: 900 }))).toEqual([]);
    expect(gate.streak).toBe(0);
  });

  it('reports progress towards acquisition', () => {
    const gate = new AcquisitionGate();
    expect(gate.streak).toBe(0);
    gate.consider(fix({ acc: 10 }));
    expect(gate.streak).toBe(1);
  });

  it('closes again on reset, as Pause requires (REQ-REC-9a)', () => {
    const gate = new AcquisitionGate();
    gate.consider(fix({ alt: 200 }));
    gate.consider(fix({ alt: 201 }));
    expect(gate.acquired).toBe(true);

    gate.reset();
    expect(gate.acquired).toBe(false);
    expect(gate.streak).toBe(0);
  });
});
