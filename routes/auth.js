const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const db = require('../config/database');
const { authenticateToken } = require('../middleware/auth');

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    const query = 'SELECT * FROM users WHERE email = ? AND active = 1';
    db.query(query, [email], async (err, results) => {
      if (err) return res.status(500).json({ message: 'Internal server error' });
      if (results.length === 0) return res.status(401).json({ message: 'Invalid email or password' });

      const user = results[0];
      const validPassword = await bcrypt.compare(password, user.password);
      if (!validPassword) return res.status(401).json({ message: 'Invalid email or password' });

      // Check if user is active
      if (!user.active) {
        return res.status(401).json({ message: 'Your account has been deactivated. Please contact the administrator.' });
      }

      const token = jwt.sign(
        { 
          id: user.id, 
          role: user.role,
          department: user.department 
        },
        process.env.JWT_SECRET || 'your-secret-key',
        { expiresIn: '1h' }
      );

      res.json({
        token,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          department: user.department,
          employee_id: user.employee_id,
          designation: user.designation
        }
      });
    });
  } catch (error) {
    res.status(500).json({ message: 'Internal server error' });
  }
});

router.post('/register', async (req, res) => {
  try {
    const { name, email, password, role, department } = req.body;
    if (!name || !email || !password || !role || !department) {
      return res.status(400).json({ message: 'All fields are required' });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    db.query('SELECT * FROM users WHERE email = ?', [email], (err, results) => {
      if (err) return res.status(500).json({ message: 'Internal server error' });
      if (results.length > 0) return res.status(400).json({ message: 'User already exists' });

      const query = 'INSERT INTO users (name, email, password, role, department) VALUES (?, ?, ?, ?, ?)';
      db.query(query, [name, email, hashedPassword, role, department], (err) => {
        if (err) return res.status(500).json({ message: 'Internal server error' });
        res.status(201).json({ message: 'User registered successfully' });
      });
    });
  } catch (error) {
    res.status(500).json({ message: 'Internal server error' });
  }
});

router.get('/verify', authenticateToken, (req, res) => {
  const query = 'SELECT id, name, email, role, department, employee_id, designation FROM users WHERE id = ?';
  db.query(query, [req.user.id], (err, results) => {
    if (err) return res.status(500).json({ message: 'Internal server error' });
    if (results.length === 0) return res.status(404).json({ message: 'User not found' });
    res.json({ user: results[0], message: 'Authentication valid' });
  });
});

module.exports = router;
