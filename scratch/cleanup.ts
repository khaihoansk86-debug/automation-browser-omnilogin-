import { OmniLogin } from '@omnilogin/sdk';
import { appConfig } from '../src/config.js';

async function main() {
  const omni = new OmniLogin({ host: appConfig.omniloginHost, timeout: 60_000 });
  console.log('Closing all profiles from 37 to 66...');
  for (let id = 37; id <= 66; id++) {
    await omni.close(id).catch(() => {});
  }
  console.log('Done!');
}

main().catch(console.error);
