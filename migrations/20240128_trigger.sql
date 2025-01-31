DELIMITER $$

DROP TRIGGER IF EXISTS after_expense_update $$

CREATE TRIGGER after_expense_update 
AFTER UPDATE ON expenses 
FOR EACH ROW 
BEGIN
    DECLARE changes_json JSON;
    
    SET changes_json = JSON_OBJECT(
        'project_id', IF(NEW.project_id != OLD.project_id, JSON_ARRAY(OLD.project_id, NEW.project_id), NULL),
        'project_name', IF(NEW.project_name != OLD.project_name, JSON_ARRAY(OLD.project_name, NEW.project_name), NULL),
        'site_name', IF(NEW.site_name != OLD.site_name, JSON_ARRAY(OLD.site_name, NEW.site_name), NULL),
        'unit', IF(NEW.unit != OLD.unit, JSON_ARRAY(OLD.unit, NEW.unit), NULL),
        'journey_date', IF(NEW.journey_date != OLD.journey_date, JSON_ARRAY(DATE(OLD.journey_date), DATE(NEW.journey_date)), NULL),
        'return_date', IF(NEW.return_date != OLD.return_date, JSON_ARRAY(DATE(OLD.return_date), DATE(NEW.return_date)), NULL),
        'transport_mode', IF(NEW.transport_mode != OLD.transport_mode, JSON_ARRAY(OLD.transport_mode, NEW.transport_mode), NULL),
        'return_transport_mode', IF(NEW.return_transport_mode != OLD.return_transport_mode, JSON_ARRAY(OLD.return_transport_mode, NEW.return_transport_mode), NULL),
        'advance_amount', IF(NEW.advance_amount != OLD.advance_amount, JSON_ARRAY(OLD.advance_amount, NEW.advance_amount), NULL),
        'train_fare', IF(NEW.train_fare != OLD.train_fare, JSON_ARRAY(OLD.train_fare, NEW.train_fare), NULL),
        'hotel_fare', IF(NEW.hotel_fare != OLD.hotel_fare, JSON_ARRAY(OLD.hotel_fare, NEW.hotel_fare), NULL),
        'food_cost', IF(NEW.food_cost != OLD.food_cost, JSON_ARRAY(OLD.food_cost, NEW.food_cost), NULL),
        'total_expense', IF(NEW.total_expense != OLD.total_expense, JSON_ARRAY(OLD.total_expense, NEW.total_expense), NULL)
    );

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
        changes_json
    );
END $$

DELIMITER ;
