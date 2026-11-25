/**
 * A stored performance log, as shown in the log viewer (REQ-ACC-7, REQ-ACC-117).
 *
 * The vehicle can be changed here; the analysis is then run again for it.
 * Export is the performance form only: one PNG per event (§7.1), not GPX or KML.
 */

import { useState } from 'preact/hooks';
import { useAnalysis } from '../../app/useAnalysis';
import type { EventKind } from '../../core/performance/export';
import { VEHICLE_LABELS } from '../../core/performance/constants';
import type { LogMeta, Units, VehicleType } from '../../core/types';
import type { LogRepository } from '../../data/logRepository';
import type { Sharer } from '../../platform/Sharer';
import { KindTabs, PerformancePanel } from './PerformancePanel';

const VEHICLES: VehicleType[] = ['motorcycle', 'car', 'bicycle'];

interface PerformanceLogViewProps {
  repository: LogRepository;
  log: LogMeta;
  sharer: Sharer;
  units: Units;
  /** Called after the vehicle changes, so the log is reloaded. */
  onChanged: () => void;
}

export function PerformanceLogView({ repository, log, sharer, units, onChanged }: PerformanceLogViewProps) {
  const [kind, setKind] = useState<EventKind>('acceleration');
  const analysis = useAnalysis(repository, log);
  const vehicle = log.vehicle ?? 'motorcycle';

  const changeVehicle = async (next: VehicleType) => {
    if (next === vehicle) return;
    await repository.setVehicle(log.id, next);
    // The cached analysis was for the old vehicle; the next view recomputes it.
    await repository.setPerformance(log.id, null);
    onChanged();
  };

  return (
    <section class="perf-log-view" aria-label={`Performance results for ${log.name}`}>
      <label class="perf-log-select">
        <span class="muted">Vehicle</span>
        <select value={vehicle} onChange={(e) => void changeVehicle((e.target as HTMLSelectElement).value as VehicleType)}>
          {VEHICLES.map((v) => (
            <option key={v} value={v}>
              {VEHICLE_LABELS[v]}
            </option>
          ))}
        </select>
      </label>

      <KindTabs value={kind} onChange={setKind} />

      <PerformancePanel
        key={`${log.id}-${kind}`}
        log={log}
        results={analysis.results}
        loading={analysis.loading}
        kind={kind}
        units={units}
        sharer={sharer}
      />
    </section>
  );
}
