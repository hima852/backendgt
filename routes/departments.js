const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { authenticateToken } = require('../middleware/auth');

// Get all departments
router.get('/', authenticateToken, (req, res) => {
  const query = 'SELECT id, name FROM departments ORDER BY name';
  db.query(query, (err, results) => {
    if (err) {
      console.error('Error fetching departments:', err);
      return res.status(500).json({ message: 'Error fetching departments', error: err.message });
    }
    res.json(results);
  });
});

module.exports = router;
