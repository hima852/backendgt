USE expense_tracker;

-- Drop all existing triggers
DROP TRIGGER IF EXISTS after_expense_update;
DROP TRIGGER IF EXISTS before_expense_update;
DROP TRIGGER IF EXISTS after_expense_insert;
DROP TRIGGER IF EXISTS before_expense_insert;

DELIMITER //

-- Create trigger to only handle history
CREATE TRIGGER after_expense_update 
AFTER UPDATE ON expenses
FOR EACH ROW
BEGIN
    -- Insert into expense history
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
            WHEN NEW.status = 'pending' AND (
                NEW.hotel_receipt != OLD.hotel_receipt OR 
                NEW.food_receipt != OLD.food_receipt OR 
                NEW.transport_receipt != OLD.transport_receipt
            ) THEN 'Status automatically reset to pending due to file update'
            ELSE NULL
        END,
        NEW.updated_by,
        NOW(),
        NEW.project_id,
        NEW.project_name
    );
END //

DELIMITER ;
