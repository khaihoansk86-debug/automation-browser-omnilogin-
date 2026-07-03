import fs from 'fs';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const msgpackr = require('../omni-asar/node_modules/msgpackr/dist/node.cjs');

const path = 'C:\\Users\\Admin\\AppData\\Roaming\\omnilogin\\automation\\data\\5230853a-7760-4487-8dbe-ba96bd290d5d.db';

try {
  const buf = fs.readFileSync(path);
  const payload = buf.slice(32);
  
  let lastPosition = 0;
  try {
    msgpackr.unpackMultiple(payload);
  } catch (err) {
    lastPosition = err.lastPosition || 0;
  }
  
  console.log('lastPosition:', lastPosition);
  console.log('payload length:', payload.length);
  const trailing = payload.slice(lastPosition);
  console.log('Trailing bytes in hex:', trailing.toString('hex').match(/../g).join(' '));
  console.log('Trailing bytes as string:', trailing.toString('utf8'));

} catch (e) {
  console.error(e);
}
