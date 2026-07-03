import fs from 'fs';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const msgpackr = require('../omni-asar/node_modules/msgpackr/dist/node.cjs');

const path = 'C:\\Users\\Admin\\AppData\\Roaming\\omnilogin\\automation\\data\\5230853a-7760-4487-8dbe-ba96bd290d5d.db';

try {
  const buf = fs.readFileSync(path);
  const header = buf.slice(0, 32);
  const payload = buf.slice(32);
  
  console.log('Header hex:', header.toString('hex').match(/../g).join(' '));
  
  // Let's manually unpack using decoder and see where it reads
  const decoder = new msgpackr.Decoder({});
  let offset = 32;
  let idx = 0;
  
  while (offset < buf.length) {
    try {
      const decoded = msgpackr.unpack(buf.slice(offset));
      // How many bytes did it consume?
      // We can find out by encoding it again, or by using decoder.decode
      const encoded = msgpackr.pack(decoded);
      console.log(`\nValue ${idx} at offset ${offset}:`);
      console.log(`- Type: ${typeof decoded}, keys: ${decoded && typeof decoded === 'object' ? Object.keys(decoded) : 'N/A'}`);
      console.log(`- Estimated size: ${encoded.length} bytes`);
      
      // Let's increment offset
      // Since msgpackr doesn't expose consumed bytes easily in unpack, let's find it by decoding with a custom function if possible,
      // or we can just use the fact that unpackMultiple decodes everything.
      
      idx++;
      offset += encoded.length; // Approximate
      if (idx > 10) break;
    } catch (e) {
      console.log(`Error at offset ${offset}:`, e.message);
      break;
    }
  }
} catch (e) {
  console.error(e);
}
