import fs from 'fs';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const msgpackr = require('../omni-asar/node_modules/msgpackr/dist/node.cjs');

const dbPath = 'C:\\Users\\Admin\\AppData\\Roaming\\omnilogin\\automation\\data\\5230853a-7760-4487-8dbe-ba96bd290d5d.db';
const backupPath = dbPath + '.bak';

try {
  // 1. Backup original file
  if (!fs.existsSync(backupPath)) {
    fs.copyFileSync(dbPath, backupPath);
    console.log(`Created backup at ${backupPath}`);
  }

  // 2. Read and unpack
  const buf = fs.readFileSync(dbPath);
  const header = buf.slice(0, 32);
  const payload = buf.slice(32);
  
  let values = [];
  try {
    msgpackr.unpackMultiple(payload);
  } catch (err) {
    values = err.values || [];
  }

  console.log(`Original file length: ${buf.length}`);

  // 3. Modify selectors in Value 1 (values[1])
  const wfd = values[1];
  if (!wfd || !wfd.d || !Array.isArray(wfd.d.nodes)) {
    throw new Error('Could not find nodes array in workflow data');
  }

  let modifiedCount = 0;
  wfd.d.nodes.forEach(node => {
    if (node.data && (node.data.description === 'click login' || node.id === 'u9q2gbm' || node.id === 'vkj64ti')) {
      console.log(`Found node ${node.id} (${node.data.label}): old selector = "${node.data.selector}"`);
      // Update to button[name="login"]
      node.data.selector = 'button[name="login"]';
      console.log(`Updated selector to: "${node.data.selector}"`);
      modifiedCount++;
    }
  });

  if (modifiedCount === 0) {
    console.log('No matching nodes modified.');
  }

  // 4. Pack values back
  const packedValues = values.map(val => msgpackr.pack(val));
  const sumPacked = packedValues.reduce((sum, p) => sum + p.length, 0);
  console.log(`New packed sum: ${sumPacked} bytes`);

  // 5. Get original footer (trailing 38 bytes)
  // The footer size is encoded in the last 4 bytes of the header (index 28-31)
  const footerSize = header.readUInt32BE(28);
  console.log(`Footer size from header: ${footerSize} bytes`);
  
  const originalFileLength = header.readUInt32BE(16);
  console.log(`Original file length from header: ${originalFileLength}`);
  
  const footerStart = buf.length - footerSize;
  const footer = buf.slice(footerStart);
  console.log(`Extracted footer of length: ${footer.length} bytes`);

  // 6. Construct new header
  const newHeader = Buffer.from(header);
  const newTotalSize = 32 + sumPacked + footerSize;
  newHeader.writeUInt32BE(newTotalSize, 16);
  console.log(`New total size: ${newTotalSize} bytes`);
  console.log('New header hex:', newHeader.toString('hex').match(/../g).join(' '));

  // 7. Reconstruct file buffer
  const chunks = [newHeader, ...packedValues, footer];
  const newBuf = Buffer.concat(chunks);
  console.log(`New file length: ${newBuf.length} bytes`);

  // 8. Write back to dbPath
  fs.writeFileSync(dbPath, newBuf);
  console.log('Successfully wrote modified workflow back to the database!');

} catch (e) {
  console.error('Error modifying workflow:', e);
}
