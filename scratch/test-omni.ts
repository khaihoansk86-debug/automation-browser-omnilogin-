import { OmniLogin } from '@omnilogin/sdk';
import { appConfig } from '../src/config.js';

async function test() {
  const omni = new OmniLogin({ host: appConfig.omniloginHost, timeout: 10000 });
  try {
    console.log('Fetching profiles list from:', appConfig.omniloginHost);
    const result = await omni.profiles.list({ page: 1, pageSize: 5 });
    console.log('Profiles found:', result.docs.map(d => ({ id: d.id, name: d.name })));
  } catch (err: any) {
    console.error('Error connecting to OmniLogin API:', err.message || err);
  }
}

test();
