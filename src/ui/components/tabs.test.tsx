import render from 'preact-render-to-string';
import { describe, expect, it } from 'vitest';
import { fixAt, straightRun } from '../../core/testFixtures';
import type { Fix } from '../../core/types';
import { ElevationTab } from './ElevationTab';
import { MapTab } from './MapTab';

const climb: Fix[] = Array.from({ length: 60 }, (_, i) =>
  fixAt(i, i * 1000, i * 20, { alt: 100 + i * 3 }),
);

describe('ElevationTab (REQ-NAV-13, REQ-NAV-20)', () => {
  it('draws the profile as SVG with no charting library', () => {
    const html = render(<ElevationTab fixes={climb} units="km" />);
    expect(html).toContain('<svg');
    expect(html).toContain('elevation-line');
    expect(html).toContain('elevation-area');
  });

  it('says so plainly when the ride carries no altitude (REQ-GPS-7)', () => {
    const html = render(<ElevationTab fixes={straightRun(30, 10)} units="km" />);
    expect(html).toContain('No elevation data');
    expect(html).not.toContain('<svg');
  });

  it('handles an empty log', () => {
    const html = render(<ElevationTab fixes={[]} units="km" />);
    expect(html).toContain('No elevation data');
  });

  it('labels only the two extremes, never every point', () => {
    const html = render(<ElevationTab fixes={climb} units="km" />);
    expect(html.match(/elevation-extreme/g)).toHaveLength(2);
  });

  it('carries no legend, since there is one series', () => {
    const html = render(<ElevationTab fixes={climb} units="km" />);
    expect(html).not.toContain('legend');
  });

  it('describes itself for screen readers', () => {
    const html = render(<ElevationTab fixes={climb} units="km" />);
    expect(html).toContain('role="img"');
    expect(html).toContain('aria-label="Elevation profile');
  });

  it('offers a table view, so the data is not shape-and-colour only', () => {
    const html = render(<ElevationTab fixes={climb} units="km" />);
    expect(html).toContain('Show table');
  });

  it('switches units (REQ-SET-2)', () => {
    const html = render(<ElevationTab fixes={climb} units="mi" />);
    expect(html).toContain('ft');
    expect(html).toContain('mi');
  });

  it('survives a completely flat profile without dividing by zero', () => {
    const flat = Array.from({ length: 20 }, (_, i) => fixAt(i, i * 1000, i * 10, { alt: 200 }));
    const html = render(<ElevationTab fixes={flat} units="km" />);
    expect(html).toContain('elevation-line');
    expect(html).not.toContain('NaN');
  });

  it('survives a track that never moves', () => {
    const still = Array.from({ length: 20 }, (_, i) => fixAt(i, i * 1000, 0, { alt: 100 + i }));
    const html = render(<ElevationTab fixes={still} units="km" />);
    expect(html).not.toContain('NaN');
  });
});

describe('MapTab (REQ-NAV-12)', () => {
  it('renders a container without pulling Leaflet into this bundle', () => {
    // The import is dynamic, so server rendering must not try to load it.
    const html = render(<MapTab fixes={climb} />);
    expect(html).toContain('map-canvas');
  });

  it('says there is nothing to draw for an empty log', () => {
    const html = render(<MapTab fixes={[]} />);
    expect(html).toContain('No positions');
  });
});

describe('ElevationTab geometry', () => {
  /** Pull the numeric coordinates out of the rendered line path. */
  function pathCoords(html: string): Array<[number, number]> {
    const match = /class="elevation-line" d="M([^"]+)"/.exec(html);
    if (!match) throw new Error('no line path rendered');
    return match[1]!
      .split(' L')
      .map((pair) => pair.split(',').map(Number) as [number, number]);
  }

  const VIEW_W = 1000;
  const VIEW_H = 320;

  it('keeps every plotted point inside the viewBox', () => {
    const html = render(<ElevationTab fixes={climb} units="km" />);
    for (const [x, y] of pathCoords(html)) {
      expect(Number.isFinite(x)).toBe(true);
      expect(Number.isFinite(y)).toBe(true);
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(VIEW_W);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(VIEW_H);
    }
  });

  it('advances left to right with distance', () => {
    const xs = pathCoords(render(<ElevationTab fixes={climb} units="km" />)).map(([x]) => x);
    expect(xs).toEqual([...xs].sort((a, b) => a - b));
  });

  it('spans the full plot width', () => {
    const xs = pathCoords(render(<ElevationTab fixes={climb} units="km" />)).map(([x]) => x);
    expect(Math.min(...xs)).toBeCloseTo(48, 0);   // left padding
    expect(Math.max(...xs)).toBeCloseTo(984, 0);  // width minus right padding
  });

  it('puts the highest altitude at the top of the plot', () => {
    // A monotonic climb must end higher on screen (smaller y) than it starts.
    const coords = pathCoords(render(<ElevationTab fixes={climb} units="km" />));
    expect(coords[coords.length - 1]![1]).toBeLessThan(coords[0]![1]);
  });
});
