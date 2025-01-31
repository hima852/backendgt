const fs = require('fs');
const path = require('path');
const db = require('./config/database');

// Function to run SQL file
const runSqlFile = async (filename) => {
  const filePath = path.join(__dirname, 'migrations', filename);
  const sql = fs.readFileSync(filePath, 'utf8');
  
  return new Promise((resolve, reject) => {
    db.query('SET GLOBAL log_bin_trust_function_creators = 1', async (err) => {
      if (err) {
        console.error('Error setting log_bin_trust_function_creators:', err);
        reject(err);
        return;
      }

      db.query(sql, (err) => {
        if (err) {
          console.error(`Error executing ${filename}:`, err);
          reject(err);
        } else {
          console.log(`Successfully executed ${filename}`);
          resolve();
        }
      });
    });
  });
};

// Run migrations in sequence
const runMigrations = async () => {
  try {
    // Enable function creation
    await db.promise().query('SET GLOBAL log_bin_trust_function_creators = 1');
    console.log('Enabled function creation');

    // Drop existing trigger
    await db.promise().query('DROP TRIGGER IF EXISTS after_expense_update');
    console.log('Dropped existing trigger');

    // Create new trigger
    const triggerSQL = `
    CREATE TRIGGER after_expense_update 
    AFTER UPDATE ON expenses
    FOR EACH ROW
    BEGIN
        IF (NEW.hotel_receipt != OLD.hotel_receipt OR 
            NEW.food_receipt != OLD.food_receipt OR 
            NEW.transport_receipt != OLD.transport_receipt) AND 
            OLD.status IN ('hr_rejected', 'coordinator_rejected', 'accounts_rejected') THEN
            
            UPDATE expenses 
            SET status = 'pending',
                coordinator_comment = NULL,
                coordinator_reviewed_at = NULL,
                coordinator_reviewer_id = NULL,
                hr_comment = NULL,
                hr_reviewed_at = NULL,
                hr_reviewer_id = NULL,
                accounts_comment = NULL,
                accounts_reviewed_at = NULL,
                accounts_reviewer_id = NULL,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = NEW.id;
            
            INSERT INTO expense_history (
                expense_id,
                status,
                previous_status,
                coordinator_comment,
                changed_by,
                changed_at,
                project_id,
                project_name
            ) VALUES (
                NEW.id,
                'pending',
                OLD.status,
                'Status automatically reset to pending due to file update',
                NEW.updated_by,
                CURRENT_TIMESTAMP,
                NEW.project_id,
                NEW.project_name
            );
        END IF;
        
        IF NEW.status != OLD.status THEN
            INSERT INTO expense_history (
                expense_id,
                status,
                previous_status,
                coordinator_comment,
                changed_by,
                changed_at,
                project_id,
                project_name
            ) VALUES (
                NEW.id,
                NEW.status,
                OLD.status,
                CASE 
                    WHEN NEW.coordinator_comment IS NOT NULL THEN NEW.coordinator_comment
                    WHEN NEW.hr_comment IS NOT NULL THEN NEW.hr_comment
                    WHEN NEW.accounts_comment IS NOT NULL THEN NEW.accounts_comment
                    ELSE NULL
                END,
                NEW.updated_by,
                CURRENT_TIMESTAMP,
                NEW.project_id,
                NEW.project_name
            );
        END IF;
    END;`;

    await db.promise().query(triggerSQL);
    console.log('Created new trigger');

    console.log('Migration completed successfully');
  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    db.end();
  }
};

// Run the migrations
runMigrations();
