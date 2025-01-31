const mysql = require('mysql2/promise');
const fs = require('fs').promises;
const path = require('path');

async function runMigration() {
    const connection = await mysql.createConnection({
        host: 'localhost',
        user: 'root',
        password: 'password',
        database: 'expense_tracker',
        multipleStatements: true
    });

    try {
        console.log('Running expense trigger update migration...');
        
        // Read and execute the SQL file
        const sqlPath = path.join(__dirname, 'migrations', '20240110_update_expense_trigger.sql');
        const sqlContent = await fs.readFile(sqlPath, 'utf8');
        
        await connection.query(sqlContent);
        
        console.log('Migration completed successfully!');
    } catch (error) {
        console.error('Error running migration:', error);
        throw error;
    } finally {
        await connection.end();
    }
}

runMigration().catch(console.error);
