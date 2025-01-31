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

// Read and execute SQL file
const sqlPath = path.join(__dirname, 'migrations', '20240128_trigger.sql');
const sql = fs.readFileSync(sqlPath, 'utf8')
  .replace(/DELIMITER \$\$/g, '')
  .replace(/DELIMITER ;/g, '')
  .replace(/\$\$/g, ';');

// Execute SQL
connection.query(sql, (err) => {
  if (err) {
    console.error('Error executing SQL:', err);
    process.exit(1);
  }
  console.log('Expense history trigger created successfully!');
  connection.end();
});
