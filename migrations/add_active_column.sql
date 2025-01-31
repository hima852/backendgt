-- Add active column to users table
ALTER TABLE users ADD COLUMN active TINYINT(1) NOT NULL DEFAULT 1;

-- Update existing users to be active
UPDATE users SET active = 1 WHERE active IS NULL;
