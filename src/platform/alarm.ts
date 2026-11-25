/**
 * Sound and vibration for the wanted-speed alert (Accelleration_Requirements.MD §8.3).
 *
 * Web Audio works in the browser and in the Android WebView. Browsers allow
 * sound only after a user gesture, so the context is created and resumed when
 * the user presses Start or sets a wanted speed (REQ-ACC-153).
 */

let context: AudioContext | null = null;

/** Call from a user gesture. Creates and resumes the audio context. */
export function unlockAlarm(): void {
  try {
    if (!context) {
      const Ctor = (globalThis as { AudioContext?: typeof AudioContext }).AudioContext;
      if (!Ctor) return;
      context = new Ctor();
    }
    if (context.state === 'suspended') void context.resume();
  } catch {
    // No audio available: the blink and the vibration still work.
  }
}

/** Whether sound can play now. False until unlocked by a gesture. */
export function alarmSoundReady(): boolean {
  return context !== null && context.state === 'running';
}

/**
 * Three loud beeps, then a vibration if the device has one and it is wanted.
 *
 * Square wave at full gain: this is meant to be heard over road and engine
 * noise (REQ-ACC-150a). The volume is the device's, set by the user.
 */
export function playAlarm(vibrate: boolean): void {
  if (vibrate && typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
    navigator.vibrate([300, 150, 300, 150, 300]);
  }

  if (!context || context.state !== 'running') return;

  const now = context.currentTime;
  for (let i = 0; i < 3; i++) {
    const start = now + i * 0.6;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = 'square';
    oscillator.frequency.value = 2400;
    gain.gain.setValueAtTime(1, start);
    gain.gain.setValueAtTime(0, start + 0.35);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(start);
    oscillator.stop(start + 0.4);
  }
}
