// backend/scripts/initDb.js
// Creates the database and tables from database/schema.sql.
// Run with: npm run db:init

const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });
const mysql = require('mysql2/promise');

(async () => {
  const schemaPath = path.join(__dirname, '..', 'database', 'schema.sql');
  const sql = fs.readFileSync(schemaPath, 'utf8');

  // Connect WITHOUT a database, since schema.sql creates it.
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    multipleStatements: true, // only enabled here, never on the app pool
  });

  try {
    await conn.query(sql);
    console.log('✅ Database schema applied successfully');
  } catch (err) {
    console.error('❌ Failed to apply schema:', err.message);
    process.exitCode = 1;
  } finally {
    await conn.end();
  }
})();