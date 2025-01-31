-- Add project columns to expense_history table
ALTER TABLE expense_history
ADD COLUMN project_id VARCHAR(255) DEFAULT NULL,
ADD COLUMN project_name VARCHAR(255) DEFAULT NULL;
