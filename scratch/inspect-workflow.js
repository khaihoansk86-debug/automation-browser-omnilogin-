import fs from 'fs';

const path = 'C:\\Users\\Admin\\AppData\\Roaming\\omnilogin\\automation\\data\\5230853a-7760-4487-8dbe-ba96bd290d5d.db';

try {
  const buf = fs.readFileSync(path);
  const str = buf.toString('binary');
  
  console.log('Searching for "click login" or similar keys...');
  
  // Let's find all occurrences of "click login" or "login" or similar
  let idx = 0;
  while (true) {
    idx = str.indexOf('login', idx);
    if (idx === -1) break;
    
    console.log(`\nMatch at index ${idx}:`);
    const start = Math.max(0, idx - 100);
    const end = Math.min(str.length, idx + 200);
    const snippet = buf.slice(start, end);
    
    // Print printable characters
    let out = '';
    for (let i = 0; i < snippet.length; i++) {
      const c = snippet[i];
      if (c >= 32 && c <= 126) {
        out += String.fromCharCode(c);
      } else {
        out += `\\x${c.toString(16).padStart(2, '0')}`;
      }
    }
    console.log(out);
    
    idx += 5;
  }
  
} catch (e) {
  console.error(e);
}
