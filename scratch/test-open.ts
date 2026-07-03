import { OmniLogin } from '@omnilogin/sdk';
import { appConfig } from '../src/config.js';

async function test() {
  const omni = new OmniLogin({ host: appConfig.omniloginHost, timeout: 60000 });
  const profileId = 37;
  try {
    console.log(`Trying to open Profile ${profileId}...`);
    const { session } = await omni.open(profileId, { headless: false });
    console.log('Opened successfully! Session page URL:', await session.page.url());
    console.log('Closing profile...');
    await omni.close(profileId);
    console.log('Closed successfully!');
  } catch (err: any) {
    console.error('Error opening profile:', err.message || err);
  }
}

test();
