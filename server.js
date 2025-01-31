require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

// Create uploads directory
!fs.existsSync('./uploads') && fs.mkdirSync('./uploads');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static('uploads'));

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/expenses', require('./routes/expenses'));
app.use('/api/users', require('./routes/users'));
app.use('/api/departments', require('./routes/departments')); // Add departments route
app.use('/api/projects', require('./routes/projects')); // Add projects route
app.use('/api/transport-modes', require('./routes/transportModes')); // Add transport modes route

// Error handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: err.message });
});

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log('\x1b[32m%s\x1b[0m', `✓ Server is running on port ${PORT}`);
  console.log('\x1b[36m%s\x1b[0m', `✓ API endpoint: http://localhost:${PORT}/api`);
  console.log('\x1b[33m%s\x1b[0m', '✓ Press CTRL+C to stop the server');
});