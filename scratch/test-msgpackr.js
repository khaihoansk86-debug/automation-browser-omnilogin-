import { createRequire } from 'module';
import util from 'util';
const require = createRequire(import.meta.url);
const msgpackr = require('../omni-asar/node_modules/msgpackr/dist/node.cjs');

console.log('msgpackr keys:', Object.keys(msgpackr));
console.log('msgpackr unpack type:', typeof msgpackr.unpack);
