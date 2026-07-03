import fs from 'fs';
import crypto from 'crypto';

const path = 'C:\\Users\\Admin\\AppData\\Roaming\\omnilogin\\automation\\data\\5230853a-7760-4487-8dbe-ba96bd290d5d.db.bak';

try {
  const buf = fs.readFileSync(path);
  const footerSize = buf.readUInt32BE(28); // 38
  const headerSize = buf.readUInt32BE(20); // 32
  
  const payload = buf.slice(headerSize, buf.length - footerSize);
  const footer = buf.slice(buf.length - footerSize);
  const targetHashHex = footer.slice(0, 30).toString('hex');
  
  console.log(`Payload length: ${payload.length}`);
  console.log(`Target Hash (30 bytes): ${targetHashHex}`);
  
  const dataToHashList = [
    { name: 'payload', data: payload },
    { name: 'header + payload', data: buf.slice(0, buf.length - footerSize) },
    { name: 'payload without last 8 bytes?', data: payload.slice(0, payload.length - 8) }
  ];
  
  const algs = ['md5', 'sha1', 'sha256', 'sha384', 'sha512', 'ripemd160'];
  
  for (const { name, data } of dataToHashList) {
    console.log(`\nTesting hashes for: ${name}`);
    for (const alg of algs) {
      try {
        const hash = crypto.createHash(alg).update(data).digest();
        const hashHex = hash.toString('hex');
        const truncatedHex = hashHex.substring(0, 60); // 30 bytes
        
        if (truncatedHex === targetHashHex) {
          console.log(`🟢 MATCH FOUND! Algorithm: ${alg}, Data: ${name}`);
          process.exit(0);
        } else {
          // Check if it matches after some other transform
          // e.g. hmac with some key?
        }
      } catch (err) {
        // Skip unsupported algs
      }
    }
  }
  
  console.log('\nNo simple hash match found.');
  
} catch (e) {
  console.error(e);
}
