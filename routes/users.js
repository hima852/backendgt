const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const db = require('../config/database');
const { authenticateToken, checkRole } = require('../middleware/auth');

// Function to ensure admin user exists
const ensureAdminExists = async () => {
  const checkAdminQuery = 'SELECT id FROM users WHERE role = "admin" AND active = 1 LIMIT 1';
  
  db.query(checkAdminQuery, async (err, results) => {
    if (err) {
      console.error('Error checking admin:', err);
      return;
    }

    if (results.length === 0) {
      // Create default admin user if none exists
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash('admin123', salt);
      
      const createAdminQuery = `
        INSERT INTO users (name, email, password, role, department, active)
        VALUES (?, ?, ?, ?, ?, ?)
      `;
      
      db.query(createAdminQuery, 
        ['Admin User', 'admin@example.com', hashedPassword, 'admin', 'Administration', 1],
        (err, result) => {
          if (err) {
            console.error('Error creating admin:', err);
          } else {
            console.log('Default admin user created');
          }
        }
      );
    }
  });
};

// Call this when the server starts
ensureAdminExists();

// Register new user (admin only)
router.post('/register', authenticateToken, checkRole(['admin']), async (req, res) => {
  try {
    const { name, email, password, role, department, employee_id, designation, phone } = req.body;
    
    // Validate input
    if (!name || !email || !password || !role || !department || !employee_id || !designation || !phone) {
      return res.status(400).json({ message: 'All fields are required' });
    }

    // Validate phone number format
    const phoneRegex = /^[0-9]{10}$/;
    if (!phoneRegex.test(phone)) {
      return res.status(400).json({ message: 'Please enter a valid 10-digit phone number' });
    }

    // Check if user already exists
    const checkQuery = 'SELECT id FROM users WHERE email = ? OR employee_id = ?';
    db.query(checkQuery, [email, employee_id], async (err, results) => {
      if (err) {
        console.error('Database error:', err);
        return res.status(500).json({ message: 'Error checking user existence', error: err.message });
      }
      
      if (results.length > 0) {
        return res.status(400).json({ message: 'User with this email or employee ID already exists' });
      }

      // Hash password
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(password, salt);

      // Insert new user
      const insertQuery = `
        INSERT INTO users (name, email, password, role, department, employee_id, designation, phone, active)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;
      
      db.query(insertQuery, [name, email, hashedPassword, role, department, employee_id, designation, phone, 1], (err, result) => {
        if (err) {
          console.error('Error creating user:', err);
          return res.status(500).json({ message: 'Error creating user', error: err.message });
        }
        res.status(201).json({ 
          message: 'User created successfully',
          userId: result.insertId 
        });
      });
    });
  } catch (error) {
    console.error('Server error:', error);
    res.status(500).json({ message: 'Internal server error', error: error.message });
  }
});

// Get user profile
router.get('/profile', authenticateToken, (req, res) => {
  console.log('Fetching profile for user:', req.user.id);
  
  const query = `
    SELECT 
      id,
      name,
      email,
      role,
      department,
      phone,
      employee_id,
      designation,
      created_at,
      updated_at
    FROM users 
    WHERE id = ? AND active = 1
  `;
  
  db.query(query, [req.user.id], (err, results) => {
    if (err) {
      console.error('Error fetching profile:', err);
      return res.status(500).json({ message: 'Error fetching profile', error: err.message });
    }
    
    if (results.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    console.log('Fetched profile data:', results[0]);
    res.json(results[0]);
  });
});

// Update user profile
router.put('/profile', authenticateToken, (req, res) => {
  const { name, email, department, phone, employee_id, designation } = req.body;
  console.log('Profile update request:', req.body);
  
  if (!name) {
    return res.status(400).json({ message: 'Name is required' });
  }

  const query = `
    UPDATE users 
    SET 
      name = ?,
      email = COALESCE(?, email),
      department = COALESCE(?, department),
      phone = COALESCE(?, phone),
      employee_id = COALESCE(?, employee_id),
      designation = COALESCE(?, designation),
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND active = 1
  `;

  db.query(
    query, 
    [name, email, department, phone, employee_id, designation, req.user.id],
    (err, result) => {
      if (err) {
        console.error('Error updating profile:', err);
        return res.status(500).json({ message: 'Error updating profile', error: err.message });
      }
      
      if (result.affectedRows === 0) {
        return res.status(404).json({ message: 'User not found' });
      }

      // Fetch updated user data
      const selectQuery = `
        SELECT id, name, email, role, department, phone, employee_id, designation 
        FROM users 
        WHERE id = ? AND active = 1
      `;
      
      db.query(selectQuery, [req.user.id], (err, results) => {
        if (err) {
          console.error('Error fetching updated profile:', err);
          return res.status(500).json({ message: 'Error fetching updated profile' });
        }
        
        if (results.length === 0) {
          return res.status(404).json({ message: 'User not found' });
        }

        res.json(results[0]);
      });
    }
  );
});

// Change password
router.put('/password', authenticateToken, async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ message: 'Current password and new password are required' });
  }

  if (newPassword.length < 6) {
    return res.status(400).json({ message: 'New password must be at least 6 characters long' });
  }

  try {
    const query = 'SELECT password FROM users WHERE id = ? AND active = 1';
    db.query(query, [req.user.id], async (err, results) => {
      if (err) return res.status(500).json({ message: 'Internal server error', error: err.message });
      if (results.length === 0) return res.status(404).json({ message: 'User not found' });

      const validPassword = await bcrypt.compare(currentPassword, results[0].password);
      if (!validPassword) return res.status(401).json({ message: 'Current password is incorrect' });

      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(newPassword, salt);

      const updateQuery = 'UPDATE users SET password = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND active = 1';
      db.query(updateQuery, [hashedPassword, req.user.id], (err) => {
        if (err) return res.status(500).json({ message: 'Error updating password', error: err.message });
        res.json({ message: 'Password updated successfully' });
      });
    });
  } catch (error) {
    res.status(500).json({ message: 'Internal server error', error: error.message });
  }
});

// Get all users with filters
router.get('/', authenticateToken, async (req, res) => {
  try {
    const query = `
      SELECT u.id, u.name, u.email, u.role, u.department_id, d.name as department_name, 
             u.phone, u.created_at 
      FROM users u
      LEFT JOIN departments d ON u.department_id = d.id
      WHERE u.active = 1`;
    const [rows] = await db.promise().query(query);
    
    res.json(rows);
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get all users (admin only)
router.get('/all', authenticateToken, checkRole(['admin']), (req, res) => {
  const query = 'SELECT id, name, email, role, department, employee_id, designation, phone, created_at, active FROM users';
  db.query(query, (err, results) => {
    if (err) {
      console.error('Error fetching users:', err);
      return res.status(500).json({ message: 'Error fetching users' });
    }
    res.json(results);
  });
});

// Get single user
router.get('/:id', authenticateToken, checkRole(['admin']), async (req, res) => {
  try {
    const userId = req.params.id;
    const query = 'SELECT id, name, email, role, department FROM users WHERE id = ? AND active = 1';
    
    db.query(query, [userId], (err, results) => {
      if (err) {
        console.error('Database error:', err);
        return res.status(500).json({ message: 'Error fetching user', error: err.message });
      }
      
      if (results.length === 0) {
        return res.status(404).json({ message: 'User not found' });
      }
      
      res.json(results[0]);
    });
  } catch (error) {
    console.error('Server error:', error);
    res.status(500).json({ message: 'Internal server error', error: error.message });
  }
});

// Update user (admin only)
router.put('/:id', authenticateToken, checkRole(['admin']), async (req, res) => {
  try {
    const { name, email, role, department, phone, employee_id, designation } = req.body;
    const userId = req.params.id;

    // Validate role
    const validRoles = ['admin', 'hr', 'accounts', 'user', 'coordinator'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({ message: 'Invalid role specified' });
    }

    // Check if target user is admin
    const checkAdminQuery = 'SELECT role FROM users WHERE id = ? AND active = 1';
    db.query(checkAdminQuery, [userId], async (err, results) => {
      if (err) {
        return res.status(500).json({ message: 'Error checking user role', error: err.message });
      }

      if (results.length === 0) {
        return res.status(404).json({ message: 'User not found' });
      }

      if (results[0].role === 'admin' && userId !== req.user.id) {
        return res.status(403).json({ message: 'Cannot modify other admin users' });
      }

      // Check if email is already taken by another user
      const emailCheckQuery = 'SELECT id FROM users WHERE email = ? AND id != ? AND active = 1';
      db.query(emailCheckQuery, [email, userId], async (err, emailResults) => {
        if (err) {
          return res.status(500).json({ message: 'Error checking email', error: err.message });
        }

        if (emailResults.length > 0) {
          return res.status(400).json({ message: 'Email already in use' });
        }

        // Update user
        const updateQuery = `
          UPDATE users 
          SET 
            name = ?,
            email = ?,
            role = ?,
            department = ?,
            phone = ?,
            employee_id = ?,
            designation = ?,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = ? AND active = 1
        `;
        
        db.query(updateQuery, [name, email, role, department, phone, employee_id, designation, userId], (err, result) => {
          if (err) {
            console.error('Error updating user:', err);
            return res.status(500).json({ message: 'Error updating user', error: err.message });
          }
          if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'User not found' });
          }
          res.json({ message: 'User updated successfully' });
        });
      });
    });
  } catch (error) {
    console.error('Server error:', error);
    res.status(500).json({ message: 'Internal server error', error: error.message });
  }
});

// Reset user password (admin only)
router.post('/:id/reset-password', authenticateToken, checkRole(['admin']), async (req, res) => {
  try {
    const userId = req.params.id;
    const { newPassword } = req.body;

    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters long' });
    }

    // Check if target user exists and their role
    const checkUserQuery = 'SELECT role FROM users WHERE id = ? AND active = 1';
    db.query(checkUserQuery, [userId], async (err, results) => {
      if (err) {
        console.error('Database error:', err);
        return res.status(500).json({ message: 'Error checking user', error: err.message });
      }

      if (results.length === 0) {
        return res.status(404).json({ message: 'User not found' });
      }

      // Don't allow resetting another admin's password unless you're that admin
      if (results[0].role === 'admin' && userId !== req.user.id) {
        return res.status(403).json({ message: 'Cannot reset another admin\'s password' });
      }

      // Hash new password
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(newPassword, salt);

      // Update password
      const updateQuery = 'UPDATE users SET password = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND active = 1';
      db.query(updateQuery, [hashedPassword, userId], (err, result) => {
        if (err) {
          console.error('Error resetting password:', err);
          return res.status(500).json({ message: 'Error resetting password', error: err.message });
        }
        res.json({ message: 'Password reset successfully' });
      });
    });
  } catch (error) {
    console.error('Server error:', error);
    res.status(500).json({ message: 'Internal server error', error: error.message });
  }
});

// Reactivate user
router.put('/:id/reactivate', authenticateToken, checkRole(['admin']), async (req, res) => {
  try {
    const userId = req.params.id;

    // Check if user exists
    const checkUserQuery = 'SELECT id FROM users WHERE id = ?';
    db.query(checkUserQuery, [userId], async (err, results) => {
      if (err) {
        console.error('Database error:', err);
        return res.status(500).json({ message: 'Error checking user', error: err.message });
      }

      if (results.length === 0) {
        return res.status(404).json({ message: 'User not found' });
      }

      // Reactivate user
      const updateQuery = 'UPDATE users SET active = 1 WHERE id = ?';
      db.query(updateQuery, [userId], (err, result) => {
        if (err) {
          console.error('Error reactivating user:', err);
          return res.status(500).json({ message: 'Error reactivating user', error: err.message });
        }

        if (result.affectedRows === 0) {
          return res.status(404).json({ message: 'User not found' });
        }

        res.json({ message: 'User reactivated successfully' });
      });
    });
  } catch (error) {
    console.error('Server error:', error);
    res.status(500).json({ message: 'Internal server error', error: error.message });
  }
});

// Deactivate user
router.put('/:id/deactivate', authenticateToken, checkRole(['admin']), async (req, res) => {
  try {
    const userId = req.params.id;

    // Check if target user exists and their role
    const checkUserQuery = 'SELECT role FROM users WHERE id = ?';
    db.query(checkUserQuery, [userId], async (err, results) => {
      if (err) {
        console.error('Database error:', err);
        return res.status(500).json({ message: 'Error checking user', error: err.message });
      }

      if (results.length === 0) {
        return res.status(404).json({ message: 'User not found' });
      }

      // Don't allow deactivating the last admin
      if (results[0].role === 'admin') {
        const adminCountQuery = 'SELECT COUNT(*) as count FROM users WHERE role = "admin" AND active = 1';
        db.query(adminCountQuery, (err, adminResults) => {
          if (err) {
            console.error('Database error:', err);
            return res.status(500).json({ message: 'Error checking admin count', error: err.message });
          }

          if (adminResults[0].count <= 1) {
            return res.status(400).json({ message: 'Cannot deactivate the last admin user' });
          }

          // Proceed with deactivation if not the last admin
          deactivateUser();
        });
      } else {
        // Proceed with deactivation for non-admin users
        deactivateUser();
      }
    });

    function deactivateUser() {
      const updateQuery = 'UPDATE users SET active = 0 WHERE id = ?';
      db.query(updateQuery, [userId], (err, result) => {
        if (err) {
          console.error('Error deactivating user:', err);
          return res.status(500).json({ message: 'Error deactivating user', error: err.message });
        }

        if (result.affectedRows === 0) {
          return res.status(404).json({ message: 'User not found' });
        }

        res.json({ message: 'User deactivated successfully' });
      });
    }
  } catch (error) {
    console.error('Server error:', error);
    res.status(500).json({ message: 'Internal server error', error: error.message });
  }
});

// Delete user (admin only)
router.delete('/:id', authenticateToken, checkRole(['admin']), async (req, res) => {
  try {
    const userId = req.params.id;

    // Check if target user exists and their role
    const checkUserQuery = 'SELECT role FROM users WHERE id = ? AND active = 1';
    db.query(checkUserQuery, [userId], async (err, results) => {
      if (err) {
        console.error('Database error:', err);
        return res.status(500).json({ message: 'Error checking user', error: err.message });
      }

      if (results.length === 0) {
        return res.status(404).json({ message: 'User not found' });
      }

      // Don't allow deleting admin users
      if (results[0].role === 'admin') {
        return res.status(403).json({ message: 'Cannot delete admin users' });
      }

      // Don't allow self-deletion
      if (userId === req.user.id) {
        return res.status(403).json({ message: 'Cannot delete your own account' });
      }

      // Delete user
      const deleteQuery = 'DELETE FROM users WHERE id = ?';
      db.query(deleteQuery, [userId], (err, result) => {
        if (err) {
          console.error('Error deleting user:', err);
          return res.status(500).json({ message: 'Error deleting user', error: err.message });
        }
        res.json({ message: 'User deleted successfully' });
      });
    });
  } catch (error) {
    console.error('Server error:', error);
    res.status(500).json({ message: 'Internal server error', error: error.message });
  }
});

// Create new user
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { name, email, password, role, department, phone } = req.body;

    // First get the department_id
    const [deptRows] = await db.promise().query(
      'SELECT id FROM departments WHERE name = ?',
      [department]
    );

    if (deptRows.length === 0) {
      return res.status(400).json({ error: 'Invalid department' });
    }

    const department_id = deptRows[0].id;
    const hashedPassword = await bcrypt.hash(password, 10);

    const [result] = await db.promise().query(
      `INSERT INTO users (name, email, password, role, department_id, department, phone, active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [name, email, hashedPassword, role, department_id, department, phone, 1]
    );

    res.status(201).json({
      id: result.insertId,
      name,
      email,
      role,
      department_id,
      department,
      phone
    });
  } catch (error) {
    console.error('Error creating user:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
