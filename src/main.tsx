/**
 * Application entry point.
 *
 * The only place that chooses concrete implementations, and it delegates
 * that to `platform/index.ts` so the choice is made once, at runtime,
 * from behind a single check.
 */

import { render } from 'preact';
import { Recorder } from './app/recorder';
import { LogRepository } from './data/logRepository';
import { createLocationSource, createSettingsStore, createSharer } from './platform';
import { App } from './ui/App';
import './ui/styles.css';

async function main(): Promise<void> {
  const root = document.getElementById('app');
  if (!root) throw new Error('Missing #app element');

  const [repository, source, sharer, settingsStore] = await Promise.all([
    LogRepository.open(),
    createLocationSource(),
    createSharer(),
    createSettingsStore(),
  ]);

  const recorder = new Recorder({ repository, source });

  render(
    <App
      recorder={recorder}
      repository={repository}
      sharer={sharer}
      settingsStore={settingsStore}
    />,
    root,
  );
}

void main();
