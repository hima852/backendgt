const fs = require('fs').promises;
const path = require('path');
const mysql = require('mysql2/promise');

async function runMigration() {
  let connection;
  try {
    connection = await mysql.createConnection({
      host: 'localhost',
      user: 'root',
      password: '1234',
      database: 'expense_tracker',
      multipleStatements: true
    });

    // First, create the table
    await connection.query(`
      USE expense_tracker;

      -- Drop existing table and trigger if they exist
      DROP TRIGGER IF EXISTS before_expense_update;
      DROP TABLE IF EXISTS expense_history;

      -- Create the expense_history table
      CREATE TABLE expense_history (
          id INT AUTO_INCREMENT PRIMARY KEY,
          expense_id INT NOT NULL,
          status VARCHAR(50),
          hr_comment TEXT,
          accounts_comment TEXT,
          hr_reviewer_id INT,
          accounts_reviewer_id INT,
          coordinator_comment TEXT,
          coordinator_reviewed_at TIMESTAMP NULL,
          coordinator_reviewer_id INT,
          changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          changed_by INT,
          FOREIGN KEY (expense_id) REFERENCES expenses(id),
          FOREIGN KEY (hr_reviewer_id) REFERENCES users(id),
          FOREIGN KEY (accounts_reviewer_id) REFERENCES users(id),
          FOREIGN KEY (coordinator_reviewer_id) REFERENCES users(id),
          FOREIGN KEY (changed_by) REFERENCES users(id)
      );
    `);

    // Then create the trigger
    await connection.query(`
      CREATE TRIGGER before_expense_update 
      BEFORE UPDATE ON expenses
      FOR EACH ROW
      BEGIN
          IF (NEW.status != OLD.status) THEN
              INSERT INTO expense_history (
                  expense_id,
                  status,
                  hr_comment,
                  accounts_comment,
                  hr_reviewer_id,
                  accounts_reviewer_id,
                  coordinator_comment,
                  coordinator_reviewed_at,
                  coordinator_reviewer_id,
                  changed_by
              )
              VALUES (
                  NEW.id,
                  NEW.status,
                  NEW.hr_comment,
                  NEW.accounts_comment,
                  NEW.hr_reviewer_id,
                  NEW.accounts_reviewer_id,
                  NEW.coordinator_comment,
                  NEW.coordinator_reviewed_at,
                  NEW.coordinator_reviewer_id,
                  NEW.updated_by
              );
          END IF;
      END
    `);

    // Insert some test history records
    await connection.query(`
      -- Get some existing expense IDs
      SET @expense_id = (SELECT id FROM expenses ORDER BY id DESC LIMIT 1);
      
      -- Insert test history records if we have an expense
      INSERT INTO expense_history 
        (expense_id, status, coordinator_comment, changed_by, changed_at)
      SELECT 
        @expense_id,
        'pending',
        'Initial submission',
        (SELECT id FROM users WHERE role = 'employee' LIMIT 1),
        NOW() - INTERVAL 2 DAY
      WHERE @expense_id IS NOT NULL;

      INSERT INTO expense_history 
        (expense_id, status, coordinator_comment, coordinator_reviewer_id, changed_by, changed_at)
      SELECT 
        @expense_id,
        'coordinator_approved',
        'Looks good to me',
        (SELECT id FROM users WHERE role = 'coordinator' LIMIT 1),
        (SELECT id FROM users WHERE role = 'coordinator' LIMIT 1),
        NOW() - INTERVAL 1 DAY
      WHERE @expense_id IS NOT NULL;
    `);

    console.log('Migration completed successfully');
  } catch (error) {
    console.error('Error running migration:', error);
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
    }
    process.exit(0);
  }
}

runMigration();
