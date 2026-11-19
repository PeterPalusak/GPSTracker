/**
 * Elevation profile: altitude against distance travelled (REQ-NAV-13).
 *
 * Hand-rolled SVG, no charting dependency (REQ-NAV-20).
 *
 * Design decisions, following the project's visualization method:
 *  - One series, so no legend — the heading names what is plotted.
 *  - 2 px line over a soft fill; grid and axes recessive.
 *  - Labels only on the extremes, never on every point.
 *  - Touch/pointer crosshair with a readout, since a phone has no hover.
 *  - A table view underneath, so the data is not available by colour and
 *    shape alone.
 *
 * Series colour #3987e5 was validated against this surface for the
 * lightness band, chroma floor and 3:1 contrast.
 */

import { useCallback, useMemo, useState } from 'preact/hooks';
import { buildElevationProfile, thinProfile } from '../../core/elevation';
import { formatAltitude, formatDistance } from '../../core/format';
import type { Fix, Units } from '../../core/types';

/** Enough resolution for a phone-width chart; more is wasted detail. */
const MAX_PLOT_POINTS = 400;

const VIEW_W = 1000;
const VIEW_H = 320;
const PAD = { top: 16, right: 16, bottom: 28, left: 48 };

interface ElevationTabProps {
  fixes: readonly Fix[];
  units: Units;
}

export function ElevationTab({ fixes, units }: ElevationTabProps) {
  const [showTable, setShowTable] = useState(false);
  const [cursor, setCursor] = useState<number | null>(null);

  const profile = useMemo(() => buildElevationProfile(fixes), [fixes]);
  const points = useMemo(
    () => (profile ? thinProfile(profile, MAX_PLOT_POINTS) : []),
    [profile],
  );

  const geometry = useMemo(() => {
    if (!profile || points.length < 2) return null;

    const plotW = VIEW_W - PAD.left - PAD.right;
    const plotH = VIEW_H - PAD.top - PAD.bottom;

    // A flat profile has no range; give it one so the line sits mid-chart
    // instead of dividing by zero.
    const span = profile.maxAlt - profile.minAlt;
    const lo = span > 0 ? profile.minAlt : profile.minAlt - 1;
    const hi = span > 0 ? profile.maxAlt : profile.maxAlt + 1;

    const x = (d: number) =>
      PAD.left + (profile.totalDistance > 0 ? (d / profile.totalDistance) * plotW : 0);
    const y = (alt: number) => PAD.top + plotH - ((alt - lo) / (hi - lo)) * plotH;

    const line = points.map((p) => `${x(p.distance).toFixed(1)},${y(p.altitude).toFixed(1)}`);
    const baseline = PAD.top + plotH;

    return {
      x,
      y,
      lo,
      hi,
      baseline,
      linePath: `M${line.join(' L')}`,
      areaPath: `M${PAD.left},${baseline} L${line.join(' L')} L${x(
        points[points.length - 1]!.distance,
      ).toFixed(1)},${baseline} Z`,
    };
  }, [profile, points]);

  const handleMove = useCallback(
    (event: PointerEvent) => {
      const svg = event.currentTarget as SVGSVGElement;
      const rect = svg.getBoundingClientRect();
      const ratio = (event.clientX - rect.left) / rect.width;
      const index = Math.round(ratio * (points.length - 1));
      setCursor(Math.max(0, Math.min(points.length - 1, index)));
    },
    [points.length],
  );

  // REQ-GPS-7: a ride where the device reported no altitude is normal, not
  // an error — say so rather than drawing an empty axis.
  if (!profile || !geometry) {
    return (
      <div class="tab-empty">
        <p>No elevation data in this ride.</p>
        <p class="muted">The device reported no altitude for these positions.</p>
      </div>
    );
  }

  const lowest = formatAltitude(profile.minAlt, units);
  const highest = formatAltitude(profile.maxAlt, units);
  const total = formatDistance(profile.totalDistance, units);
  const active = cursor !== null ? points[cursor] : null;

  return (
    <div class="tab-body viz">
      <div class="viz-head">
        <h3>
          Elevation over distance
          <span class="muted">
            {' '}
            · {highest.value}–{lowest.value} {highest.unit}
          </span>
        </h3>
        <button type="button" class="link-btn" onClick={() => setShowTable((s) => !s)}>
          {showTable ? 'Hide table' : 'Show table'}
        </button>
      </div>

      <svg
        class="elevation"
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={`Elevation profile from ${lowest.value} to ${highest.value} ${highest.unit} over ${total.value} ${total.unit}`}
        onPointerMove={handleMove}
        onPointerDown={handleMove}
        onPointerLeave={() => setCursor(null)}
      >
        {/* Recessive gridlines at the extremes and the midpoint. */}
        {[0, 0.5, 1].map((t) => {
          const value = geometry.lo + (geometry.hi - geometry.lo) * t;
          const yy = geometry.y(value);
          return (
            <g key={t}>
              <line
                class="viz-grid"
                x1={PAD.left}
                x2={VIEW_W - PAD.right}
                y1={yy}
                y2={yy}
              />
              <text class="viz-tick" x={PAD.left - 8} y={yy + 4} text-anchor="end">
                {formatAltitude(value, units).value}
              </text>
            </g>
          );
        })}

        <path class="elevation-area" d={geometry.areaPath} />
        <path class="elevation-line" d={geometry.linePath} />

        {/* Direct labels on the extremes only — never one per point. */}
        <circle
          class="elevation-extreme"
          cx={geometry.x(profile.points[profile.maxIndex]!.distance)}
          cy={geometry.y(profile.maxAlt)}
          r="5"
        />
        <circle
          class="elevation-extreme"
          cx={geometry.x(profile.points[profile.minIndex]!.distance)}
          cy={geometry.y(profile.minAlt)}
          r="5"
        />

        {active && (
          <g class="elevation-cursor">
            <line
              x1={geometry.x(active.distance)}
              x2={geometry.x(active.distance)}
              y1={PAD.top}
              y2={geometry.baseline}
            />
            <circle
              cx={geometry.x(active.distance)}
              cy={geometry.y(active.altitude)}
              r="6"
            />
          </g>
        )}

        <text class="viz-tick" x={PAD.left} y={VIEW_H - 8}>
          0
        </text>
        <text class="viz-tick" x={VIEW_W - PAD.right} y={VIEW_H - 8} text-anchor="end">
          {total.value} {total.unit}
        </text>
      </svg>

      <p class="viz-readout">
        {active ? (
          <>
            <strong>{formatAltitude(active.altitude, units).value}</strong>{' '}
            {formatAltitude(active.altitude, units).unit} at{' '}
            <strong>{formatDistance(active.distance, units).value}</strong>{' '}
            {formatDistance(active.distance, units).unit}
          </>
        ) : (
          <span class="muted">Touch the chart to read a point.</span>
        )}
      </p>

      {showTable && (
        <div class="viz-table-wrap">
          <table class="viz-table">
            <thead>
              <tr>
                <th scope="col">Distance</th>
                <th scope="col">Altitude</th>
              </tr>
            </thead>
            <tbody>
              {points.map((p, i) => (
                <tr key={i}>
                  <td>
                    {formatDistance(p.distance, units).value}{' '}
                    {formatDistance(p.distance, units).unit}
                  </td>
                  <td>
                    {formatAltitude(p.altitude, units).value}{' '}
                    {formatAltitude(p.altitude, units).unit}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
