++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++USE expense_tracker;

-- Add project columns to expense_history table
ALTER TABLE expense_history
ADD COLUMN project_id VARCHAR(255) DEFAULT NULL,
ADD COLUMN project_name VARCHAR(255) DEFAULT NULL;

-- Drop existing trigger
DROP TRIGGER IF EXISTS after_expense_update;

-- Create trigger
CREATE TRIGGER after_expense_update 
AFTER UPDATE ON expenses
FOR EACH ROW
BEGIN
    -- Check if any receipt files were updated
    IF (NEW.hotel_receipt != OLD.hotel_receipt OR 
        NEW.food_receipt != OLD.food_receipt OR 
        NEW.transport_receipt != OLD.transport_receipt) AND 
        OLD.status IN ('hr_rejected', 'coordinator_rejected', 'accounts_rejected') THEN
        
        -- Update status to pending when files are updated after rejection
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
        
        -- Insert into expense history with previous_status and project info
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
    
    -- Track all status changes with project info
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
END;
