import fs from 'fs';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const msgpackr = require('../omni-asar/node_modules/msgpackr/dist/node.cjs');

const path = 'C:\\Users\\Admin\\AppData\\Roaming\\omnilogin\\automation\\data\\5230853a-7760-4487-8dbe-ba96bd290d5d.db';

try {
  const buf = fs.readFileSync(path);
  const payload = buf.slice(32);
  
  let decodedArray = [];
  try {
    decodedArray = msgpackr.unpackMultiple(payload);
  } catch (err) {
    console.log('Caught expected error from unpackMultiple, using partially decoded values.');
    if (err.values) {
      decodedArray = err.values;
    } else {
      throw err;
    }
  }
  
  console.log('Successfully extracted', decodedArray.length, 'values.');
  fs.writeFileSync('C:\\Codex\\scratch\\workflow-decoded.json', JSON.stringify(decodedArray, null, 2));
  console.log('Saved to workflow-decoded.json');
  
  const wfd = decodedArray[1];
  if (wfd && wfd.d) {
    console.log('d keys:', Object.keys(wfd.d));
    const nodes = wfd.d.nodes;
    if (Array.isArray(nodes)) {
      console.log(`d contains ${nodes.length} nodes.`);
      nodes.forEach(node => {
        if (node.data) {
          console.log(`- Node ${node.id} (${node.data.label || node.type}): ${node.data.description || ''}`);
          if (node.data.selector) {
            console.log(`    Selector: "${node.data.selector}"`);
          }
        }
      });
    }
  }

} catch (e) {
  console.error('Error:', e);
}
