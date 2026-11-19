/**
 * The track drawn over a map (REQ-NAV-12, REQ-NAV-15…19).
 *
 * Leaflet with OpenStreetMap raster tiles: no API key, no account, no
 * billing (REQ-NAV-16). Loaded lazily, so neither Leaflet nor its CSS is
 * in the bundle that the main screen pays for — a rider who never opens
 * this tab never downloads it.
 *
 * Tiles come from the network, which makes this the one part of the app
 * that does not work offline (REQ-NAV-14, REQ-STO-6).
 */

import { useEffect, useRef, useState } from 'preact/hooks';
import type { LatLon } from '../../core/geo';
import { simplifyToBudget } from '../../core/simplify';
import type { Fix } from '../../core/types';

/** Display budget (REQ-NAV-19). Panning stutters well before 10,000. */
const MAX_TRACK_POINTS = 2_000;

interface MapTabProps {
  fixes: readonly Fix[];
}

export function MapTab({ fixes }: MapTabProps) {
  const container = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'offline' | 'failed'>(
    'loading',
  );

  useEffect(() => {
    if (fixes.length === 0) return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      setStatus('offline');
      return;
    }

    let map: import('leaflet').Map | null = null;
    let cancelled = false;

    void (async () => {
      try {
        const L = await import('leaflet');
        await import('leaflet/dist/leaflet.css');
        if (cancelled || !container.current) return;

        const track: LatLon[] = simplifyToBudget(
          fixes.map((f) => ({ lat: f.lat, lon: f.lon })),
          MAX_TRACK_POINTS,
        );
        const latLngs = track.map((p) => [p.lat, p.lon] as [number, number]);

        map = L.map(container.current, { attributionControl: true });

        L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19,
          // REQ-NAV-17: required by the OSM tile usage policy.
          attribution: '&copy; OpenStreetMap contributors',
        }).addTo(map);

        const line = L.polyline(latLngs, { color: '#3987e5', weight: 4 }).addTo(map);

        // Start and end, so the direction of travel is readable.
        const first = latLngs[0];
        const last = latLngs[latLngs.length - 1];
        if (first) {
          L.circleMarker(first, { radius: 6, color: '#2ea043', fillOpacity: 1 })
            .bindTooltip('Start')
            .addTo(map);
        }
        if (last && latLngs.length > 1) {
          L.circleMarker(last, { radius: 6, color: '#f85149', fillOpacity: 1 })
            .bindTooltip('End')
            .addTo(map);
        }

        map.fitBounds(line.getBounds(), { padding: [24, 24] });
        setStatus('ready');
      } catch {
        if (!cancelled) setStatus('failed');
      }
    })();

    return () => {
      cancelled = true;
      map?.remove();
    };
  }, [fixes]);

  if (fixes.length === 0) {
    return (
      <div class="tab-empty">
        <p>No positions in this ride.</p>
      </div>
    );
  }

  return (
    <div class="tab-body map-tab">
      <div ref={container} class="map-canvas" />

      {status !== 'ready' && (
        <div class="map-overlay">
          {status === 'loading' && <p class="muted">Loading map…</p>}
          {status === 'offline' && (
            <>
              <p>Map tiles need a network connection.</p>
              <p class="muted">
                Statistics and the elevation profile work offline; this tab does not.
              </p>
            </>
          )}
          {status === 'failed' && <p class="muted">The map could not be loaded.</p>}
        </div>
      )}
    </div>
  );
}
