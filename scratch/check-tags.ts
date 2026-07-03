import { OmniLogin } from '@omnilogin/sdk';
import { appConfig } from '../src/config.js';

async function main() {
  const omni = new OmniLogin({ host: appConfig.omniloginHost, timeout: 60_000 });
  const profileResult = await omni.profiles.list({ page: 1, pageSize: 100 });
  const profiles = profileResult.docs.sort((a, b) => a.id - b.id);
  for (const p of profiles) {
    console.log(`ID: ${p.id}, Name: ${p.name}, Tags: ${JSON.stringify(p.tags)}`);
  }
}

main().catch(console.error);
