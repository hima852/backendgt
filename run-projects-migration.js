const fs = require('fs');
const path = require('path');
const db = require('./config/database');

const migrationFile = path.join(__dirname, 'migrations', '20240128_create_projects_table.sql');
const migration = fs.readFileSync(migrationFile, 'utf8');

// Split migration into individual statements
const statements = migration.split(';').filter(stmt => stmt.trim());

// Execute each statement
statements.forEach(statement => {
    if (statement.trim()) {
        db.query(statement, (err) => {
            if (err) {
                console.error('Error executing migration:', err);
                process.exit(1);
            }
            console.log('Successfully executed statement:', statement.trim());
        });
    }
});

console.log('Migration completed successfully');

// Close the connection after all queries are done
setTimeout(() => {
    db.end();
    process.exit(0);
}, 1000);
