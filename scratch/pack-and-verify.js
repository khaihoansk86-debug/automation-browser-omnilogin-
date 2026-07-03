import fs from 'fs';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const msgpackr = require('../omni-asar/node_modules/msgpackr/dist/node.cjs');

const path = 'C:\\Users\\Admin\\AppData\\Roaming\\omnilogin\\automation\\data\\5230853a-7760-4487-8dbe-ba96bd290d5d.db';

try {
  const buf = fs.readFileSync(path);
  const header = buf.slice(0, 32);
  const payload = buf.slice(32);
  
  let values = [];
  try {
    msgpackr.unpackMultiple(payload);
  } catch (err) {
    values = err.values || [];
  }
  
  console.log(`Original file length: ${buf.length}`);
  console.log('Original header:');
  console.log(header.toString('hex').match(/../g).join(' '));
  
  const packedValues = values.map(val => msgpackr.pack(val));
  packedValues.forEach((p, idx) => {
    console.log(`Packed Value ${idx} length: ${p.length} bytes`);
  });
  
  const sumPacked = packedValues.reduce((sum, p) => sum + p.length, 0);
  console.log(`Sum of packed values: ${sumPacked} bytes`);
  
  const trailing = payload.slice(52477 - 32); // Wait, lastPosition in payload was 52477
  console.log(`Trailing length: ${trailing.length} bytes`);
  
  console.log(`Header (32) + Sum (${sumPacked}) + Trailing (${trailing.length}) = ${32 + sumPacked + trailing.length}`);

} catch (e) {
  console.error(e);
}
