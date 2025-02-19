USE expense_tracker;

DROP TABLE IF EXISTS transport_modes;

CREATE TABLE transport_modes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    mode_name VARCHAR(255) NOT NULL UNIQUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
