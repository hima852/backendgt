const mysql = require('mysql2');
const bcrypt = require('bcrypt');

const connection = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: '1234'
});

// Create database and tables
const setupDatabase = async () => {
  try {
    // Create database
    await connection.promise().query('CREATE DATABASE IF NOT EXISTS expense_tracker');
    console.log('Database created');

    // Use database
    await connection.promise().query('USE expense_tracker');

    // Create users table
    await connection.promise().query(`
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(50) NOT NULL UNIQUE,
        password VARCHAR(255) NOT NULL,
        role ENUM('admin', 'hr', 'accounts', 'user') NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('Users table created');

    // Create expenses table
    await connection.promise().query(`
      CREATE TABLE IF NOT EXISTS expenses (
        id INT AUTO_INCREMENT PRIMARY KEY,
        employee_name VARCHAR(255) NOT NULL,
        employee_id VARCHAR(50) NOT NULL,
        designation VARCHAR(100) NOT NULL,
        department VARCHAR(100) NOT NULL,
        site_name VARCHAR(255) NOT NULL,
        unit VARCHAR(50) NOT NULL,
        journey_date DATE NOT NULL,
        transport_mode VARCHAR(50) NOT NULL,
        return_date DATE,
        advance_amount DECIMAL(10, 2) NOT NULL,
        train_fare DECIMAL(10, 2) NOT NULL,
        hotel_fare DECIMAL(10, 2) NOT NULL,
        food_cost DECIMAL(10, 2) NOT NULL,
        total_expense DECIMAL(10, 2) NOT NULL,
        status ENUM('pending', 'hr_approved', 'hr_rejected', 'completed') DEFAULT 'pending',
        user_id INT NOT NULL,
        hr_comment TEXT,
        accounts_comment TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
      )
    `);
    console.log('Expenses table created');

    // Create test users
    const password = await bcrypt.hash('password123', 10);
    const users = [
      ['admin', password, 'admin'],
      ['hr', password, 'hr'],
      ['accounts', password, 'accounts'],
      ['user1', password, 'user']
    ];

    for (const [username, password, role] of users) {
      try {
        await connection.promise().query(
          'INSERT INTO users (username, password, role) VALUES (?, ?, ?)',
          [username, password, role]
        );
        console.log(`Created user: ${username}`);
      } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') {
          console.log(`User ${username} already exists`);
        } else {
          throw err;
        }
      }
    }

    console.log('Setup completed successfully');
  } catch (err) {
    console.error('Error during setup:', err);
  } finally {
    connection.end();
  }
};

setupDatabase();
