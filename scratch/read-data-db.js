import { DatabaseSync } from 'node:sqlite';

const dbPath = 'C:\\Users\\Admin\\AppData\\Roaming\\omnilogin\\automation\\data\\db.sqlite';

try {
  const db = new DatabaseSync(dbPath);
  
  // List all tables
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
  console.log('Tables in data/db.sqlite:', tables);

  for (const t of tables) {
    console.log(`\nTable ${t.name}:`);
    try {
      const rows = db.prepare(`SELECT * FROM "${t.name}" LIMIT 5`).all();
      console.log(rows);
    } catch (e) {
      console.error(`Error reading table ${t.name}:`, e.message);
    }
  }

} catch (err) {
  console.error('Error opening database:', err);
}
