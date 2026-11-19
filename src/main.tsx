/**
 * Application entry point.
 *
 * Wires the concrete implementations together — the only place that
 * chooses which LocationSource and which storage the app runs against.
 * Phase 10 swaps the source here for the native one.
 */

import { render } from 'preact';
import { Recorder } from './app/recorder';
import { LogRepository } from './data/logRepository';
import { WebSharer } from './platform/Sharer';
import { WebLocationSource } from './platform/WebLocationSource';
import { App } from './ui/App';
import './ui/styles.css';

async function main(): Promise<void> {
  const root = document.getElementById('app');
  if (!root) throw new Error('Missing #app element');

  const repository = await LogRepository.open();
  const recorder = new Recorder({
    repository,
    source: new WebLocationSource(),
  });

  render(
    <App recorder={recorder} repository={repository} sharer={new WebSharer()} />,
    root,
  );
}

void main();
