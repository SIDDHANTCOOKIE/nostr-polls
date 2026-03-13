import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.formstr.pollerama',
  appName: 'Pollerama',
  webDir: 'build',
  android: {
    allowMixedContent: true,
  },
};

export default config;
