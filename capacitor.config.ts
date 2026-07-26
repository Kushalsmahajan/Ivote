import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.ivote.app',
  appName: 'iVote',
  webDir: 'dist',
  plugins: {
    FirebaseAuthentication: {
      skipNativeAuth: false,
      providers: ['google.com'],
    },
  },
  server: {
    hostname: 'ivote.web.app',
    allowNavigation: ['ivote.web.app', '*.web.app', '*.firebaseapp.com'],
  },
};

export default config;
