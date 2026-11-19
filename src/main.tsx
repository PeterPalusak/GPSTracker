/**
 * Application entry point.
 *
 * A placeholder until Phase 4 builds the main screen. Phase 1 delivers the
 * pure core only; this exists so the project builds and the dev server runs.
 */

import { render } from 'preact';
import { controlsFor } from './core/recordingMachine';

function Placeholder() {
  const controls = controlsFor('idle');
  return (
    <main>
      <h1>GPS Logger</h1>
      <p>Phase 1 — core domain only. The UI arrives in Phase 4.</p>
      <p>
        Primary control would read <strong>{controls.primary.label}</strong>.
      </p>
    </main>
  );
}

const root = document.getElementById('app');
if (root) render(<Placeholder />, root);
