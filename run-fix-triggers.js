const mysql = require('mysql2');
const fs = require('fs');
const path = require('path');

// Create connection
const connection = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: '1234',
  database: 'expense_tracker',
  multipleStatements: true
});

// Read SQL file
const sqlPath = path.join(__dirname, 'migrations', '20240128_fix_triggers.sql');
const sql = fs.readFileSync(sqlPath, 'utf8');

// Execute SQL
connection.query(sql, (err, results) => {
  if (err) {
    console.error('Error executing SQL:', err);
    process.exit(1);
  }
  console.log('Triggers updated successfully');
  process.exit(0);
});
