DROP TRIGGER IF EXISTS after_expense_update;

CREATE TRIGGER after_expense_update 
AFTER UPDATE ON expenses 
FOR EACH ROW 
BEGIN
    INSERT INTO expense_history (
        expense_id,
        status,
        previous_status,
        coordinator_comment,
        hr_comment,
        accounts_comment,
        changed_by,
        changed_at,
        project_id,
        project_name,
        changes
    )
    VALUES (
        NEW.id,
        NEW.status,
        OLD.status,
        CASE 
            WHEN NEW.status != OLD.status AND NEW.coordinator_comment != OLD.coordinator_comment THEN NEW.coordinator_comment
            WHEN NEW.status != OLD.status AND NEW.hr_comment != OLD.hr_comment THEN NEW.hr_comment
            WHEN NEW.status != OLD.status AND NEW.accounts_comment != OLD.accounts_comment THEN NEW.accounts_comment
            ELSE NULL
        END,
        NEW.hr_comment,
        NEW.accounts_comment,
        NEW.updated_by,
        NOW(),
        NEW.project_id,
        NEW.project_name,
        '{}'
    );
