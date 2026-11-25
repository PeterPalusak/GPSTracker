/**
 * The performance analysis of one log, computed once and cached on the log
 * (REQ-ACC-108…111).
 *
 * The cache is reused only while its algorithm version and vehicle still
 * match. Otherwise the analysis is run again from the stored fixes.
 */

import { useEffect, useState } from 'preact/hooks';
import { analysePerformance, type PerformanceResults } from '../core/performance/analysis';
import { ANALYSIS_VERSION, DEFAULT_VEHICLE } from '../core/performance/constants';
import type { LogMeta } from '../core/types';
import type { LogRepository } from '../data/logRepository';

export interface UseAnalysisResult {
  results: PerformanceResults | null;
  loading: boolean;
}

/** The cached analysis if it is still valid, otherwise a fresh one, stored back. */
export async function analyseAndCache(
  repository: LogRepository,
  log: LogMeta,
): Promise<PerformanceResults> {
  const vehicle = log.vehicle ?? DEFAULT_VEHICLE;
  const cached = log.performance;
  if (cached && cached.version === ANALYSIS_VERSION && cached.vehicle === vehicle) {
    return cached;
  }
  const fixes = await repository.readPoints(log.id);
  const results = analysePerformance(fixes, vehicle);
  await repository.setPerformance(log.id, results);
  return results;
}

export function useAnalysis(repository: LogRepository, log: LogMeta | null): UseAnalysisResult {
  const [state, setState] = useState<UseAnalysisResult>({ results: null, loading: false });
  const logId = log?.id ?? null;
  const vehicle = log?.vehicle ?? null;
  const cachedVersion = log?.performance?.version ?? null;

  useEffect(() => {
    if (!log) {
      setState({ results: null, loading: false });
      return;
    }
    let cancelled = false;
    setState((s) => ({ ...s, loading: true }));
    void analyseAndCache(repository, log).then((results) => {
      if (!cancelled) setState({ results, loading: false });
    });
    return () => {
      cancelled = true;
    };
    // The analysis depends on the log's identity, vehicle and cache version only.
    // The log object is replaced on every reload, so it is deliberately not a key.
  }, [repository, logId, vehicle, cachedVersion]);

  return state;
}
