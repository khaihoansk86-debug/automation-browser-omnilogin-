import { appConfig } from './config.js';
import { listProfiles, runGoogleSearchWorkflow } from './workflow.js';

const args = new Map<string, string>();

for (const arg of process.argv.slice(2)) {
  const [key, ...value] = arg.replace(/^--/, '').split('=');
  if (key) {
    args.set(key, value.join('='));
  }
}

const profileIdArg = args.get('profileId');
const keyword = args.get('keyword') || appConfig.defaultKeyword;
const useRandomKeyword = args.get('random') === 'true';

if (!profileIdArg) {
  const profiles = await listProfiles();
  console.log('Profiles:');
  for (const profile of profiles) {
    console.log(`${profile.id}\t${profile.name}`);
  }
  console.log('\nRun with: npm.cmd run run:search -- --profileId=<id> --keyword="Omnilogin"');
  process.exit(0);
}

const result = await runGoogleSearchWorkflow({
  profileId: Number(profileIdArg),
  keyword,
  useRandomKeyword,
});

console.log(JSON.stringify(result, null, 2));
