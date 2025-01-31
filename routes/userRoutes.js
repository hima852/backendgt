const express = require('express');
const router = express.Router();
const pool = require('../db');
const auth = require('../middleware/auth');
const bcrypt = require('bcrypt');

// Get user profile
router.get('/profile', auth, async (req, res) => {
    try {
        const userId = req.user.id;
        const result = await pool.query(
            'SELECT id, name, email, role, department, phone FROM users WHERE id = $1',
            [userId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'User not found' });
        }

        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error fetching profile:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Update user profile
router.put('/profile', auth, async (req, res) => {
    try {
        const userId = req.user.id;
        const { name, email, department, phone } = req.body;

        // Update user profile
        const result = await pool.query(
            `UPDATE users 
             SET name = COALESCE($1, name),
                 email = COALESCE($2, email),
                 department = COALESCE($3, department),
                 phone = COALESCE($4, phone),
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $5
             RETURNING id, name, email, role, department, phone`,
            [name, email, department, phone, userId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'User not found' });
        }

        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error updating profile:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Change password
router.put('/profile/password', auth, async (req, res) => {
    try {
        const userId = req.user.id;
        const { currentPassword, newPassword } = req.body;

        // Get current user password
        const user = await pool.query('SELECT password FROM users WHERE id = $1', [userId]);
        
        if (user.rows.length === 0) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Verify current password
        const validPassword = await bcrypt.compare(currentPassword, user.rows[0].password);
        if (!validPassword) {
            return res.status(400).json({ message: 'Current password is incorrect' });
        }

        // Hash new password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(newPassword, salt);

        // Update password
        await pool.query(
            'UPDATE users SET password = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
            [hashedPassword, userId]
        );

        res.json({ message: 'Password updated successfully' });
    } catch (error) {
        console.error('Error changing password:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Update user by ID (admin only)
router.put('/users/:id', auth, async (req, res) => {
    try {
        const userId = req.params.id;
        const { name, email, role, department, phone, employeeId, designation } = req.body;

        // Update user
        const result = await pool.query(
            `UPDATE users 
             SET name = COALESCE($1, name),
                 email = COALESCE($2, email),
                 role = COALESCE($3, role),
                 department = COALESCE($4, department),
                 phone = COALESCE($5, phone),
                 employee_id = COALESCE($6, employee_id),
                 designation = COALESCE($7, designation),
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $8
             RETURNING id, name, email, role, department, phone, employee_id, designation`,
            [name, email, role, department, phone, employeeId, designation, userId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'User not found' });
        }

        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error updating user:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Delete user by ID (admin only)
router.delete('/users/:id', auth, async (req, res) => {
    const client = await pool.connect();
    
    try {
        await client.query('BEGIN'); // Start transaction
        
        const userId = req.params.id;
        
        // First check if user has any expenses
        const expensesCheck = await client.query(
            'SELECT COUNT(*) FROM expenses WHERE user_id = $1',
            [userId]
        );

        if (expensesCheck.rows[0].count > 0) {
            // Delete all expenses for this user first
            await client.query(
                'DELETE FROM expenses WHERE user_id = $1',
                [userId]
            );
        }

        // Now delete the user
        const result = await client.query(
            'DELETE FROM users WHERE id = $1 RETURNING id',
            [userId]
        );

        if (result.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ message: 'User not found' });
        }

        await client.query('COMMIT');
        res.json({ 
            message: 'User deleted successfully',
            expensesDeleted: parseInt(expensesCheck.rows[0].count)
        });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error deleting user:', error);
        res.status(500).json({ message: 'Server error' });
    } finally {
        client.release();
    }
});

module.exports = router;
