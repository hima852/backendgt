const fs = require('fs');
const path = require('path');
const db = require('./config/database');

const migrationFile = path.join(__dirname, 'migrations', '20240128_create_transport_modes.sql');
const migration = fs.readFileSync(migrationFile, 'utf8');

// Split migration into separate statements
const statements = migration
  .split(';')
  .map(stmt => stmt.trim())
  .filter(stmt => stmt.length > 0);

// Execute statements sequentially
const executeStatements = async () => {
  try {
    for (const stmt of statements) {
      await new Promise((resolve, reject) => {
        db.query(stmt, (err) => {
          if (err) {
            console.error('Error executing statement:', err);
            reject(err);
          } else {
            console.log('Successfully executed statement');
            resolve();
          }
        });
      });
    }
    console.log('Migration completed successfully');
  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    db.end();
  }
};

executeStatements();
