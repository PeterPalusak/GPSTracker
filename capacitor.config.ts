import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.palusak.gpslogger',
  appName: 'GPS Logger',
  webDir: 'dist',

  android: {
    /**
     * Required by @capacitor-community/background-geolocation.
     *
     * Without the legacy bridge, Android throttles the modern bridge after
     * about five minutes in the background and location updates stop
     * arriving — which is precisely the failure the APK exists to avoid
     * (REQ-BG-7). See the plugin's README and its issue #89.
     */
    useLegacyBridge: true,
  },

  plugins: {
    /**
     * The persistent notification shown while recording (REQ-BG-9).
     * Android requires one for a foreground service, and it is also how
     * the user stops a runaway recording from outside the app.
     */
    BackgroundGeolocation: {
      backgroundTitle: 'Recording a ride',
      backgroundMessage: 'Tap to return to GPS Logger.',
    },
  },
};

export default config;
