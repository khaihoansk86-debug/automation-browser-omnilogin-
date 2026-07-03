import { DatabaseSync } from 'node:sqlite';

const dbPath = 'C:\\Users\\Admin\\AppData\\Roaming\\omnilogin\\automation\\db.sqlite';

try {
  const db = new DatabaseSync(dbPath);
  
  // Get all columns of workflows table
  const columns = db.prepare("PRAGMA table_info(workflows)").all();
  console.log('workflows table columns:', columns);
  
  // Get all rows
  const rows = db.prepare("SELECT * FROM workflows").all();
  console.log('workflows rows:', JSON.stringify(rows, null, 2));

} catch (err) {
  console.error(err);
}
