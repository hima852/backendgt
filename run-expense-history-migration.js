const fs = require('fs');
const path = require('path');
const db = require('./config/database');

const migrationFile = path.join(__dirname, 'migrations', '20240128_update_expense_history.sql');
const migration = fs.readFileSync(migrationFile, 'utf8');

// Execute the migration in a single query
db.query(migration, (err) => {
  if (err) {
    console.error('Error executing migration:', err);
    process.exit(1);
  }
  console.log('Migration completed successfully');
  
  // Close the connection
  db.end();
  process.exit(0);
});
