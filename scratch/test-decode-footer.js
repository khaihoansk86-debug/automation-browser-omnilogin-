import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const msgpackr = require('../omni-asar/node_modules/msgpackr/dist/node.cjs');

// Footer 1 hex: 96 83 57 5e 4a 6d bc 6f b2 0c 72 ed 6b 97 c2 eb b6 99 9d 2c 51 bd 64 8c 5f 94 2a 1f 76 ec
const hex = '9683575e4a6dbc6fb20c72ed6b97c2ebb6999d2c51bd648c5f942a1f76ec';
const buf = Buffer.from(hex, 'hex');

try {
  const decoded = msgpackr.unpack(buf);
  console.log('Decoded footer successfully!', decoded);
} catch (e) {
  console.error('Failed to decode footer:', e.message);
}
