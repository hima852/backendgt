USE expense_tracker;

-- Drop existing trigger
DROP TRIGGER IF EXISTS after_expense_update;

-- Create trigger
DELIMITER //

CREATE TRIGGER after_expense_update 
AFTER UPDATE ON expenses
FOR EACH ROW
BEGIN
    -- Only insert history when status changes or files are updated
    IF (NEW.status != OLD.status OR
        NEW.hotel_receipt != OLD.hotel_receipt OR 
        NEW.food_receipt != OLD.food_receipt OR 
        NEW.transport_receipt != OLD.transport_receipt) THEN
        
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
    END IF;
END //

DELIMITER ;
