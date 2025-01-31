const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const db = require('../config/database');
const { authenticateToken, checkRole } = require('../middleware/auth');
const { upload, uploadsDir } = require('../utils/upload');

const expenseUpload = upload.fields([
  { name: 'hotelReceipt', maxCount: 1 },
  { name: 'foodReceipt', maxCount: 1 },
  { name: 'transportReceipt', maxCount: 1 }
]);

// Helper function to save transport mode
const saveTransportMode = async (mode) => {
  if (!mode) return;
  try {
    await db.promise().query(
      'INSERT INTO transport_modes (mode_name) VALUES (?) ON DUPLICATE KEY UPDATE mode_name = VALUES(mode_name)',
      [mode]
    );
  } catch (error) {
    console.error('Error saving transport mode:', error);
  }
};

// Serve receipt files
router.get('/receipt/:filename', authenticateToken, (req, res) => {
  const filename = req.params.filename;
  
  // Validate filename
  if (!filename) {
    return res.status(400).json({
      status: 'error',
      code: 'MISSING_FILENAME',
      message: 'Receipt filename is required',
      details: {
        help: 'Please provide a valid receipt filename'
      }
    });
  }

  // Validate file extension
  const allowedExtensions = ['.pdf', '.jpg', '.jpeg', '.png'];
  const fileExtension = path.extname(filename).toLowerCase();
  if (!allowedExtensions.includes(fileExtension)) {
    return res.status(400).json({
      status: 'error',
      code: 'INVALID_FILE_TYPE',
      message: 'Invalid receipt file type',
      details: {
        providedExtension: fileExtension,
        allowedExtensions,
        help: 'Receipt must be a PDF or image file (PDF, JPG, JPEG, PNG)'
      }
    });
  }

  const filepath = path.join(uploadsDir, filename);

  // Check if file exists
  if (!fs.existsSync(filepath)) {
    return res.status(404).json({
      status: 'error',
      code: 'FILE_NOT_FOUND',
      message: 'Receipt file not found',
      details: {
        filename,
        help: 'The requested receipt file does not exist. Please verify the filename.'
      }
    });
  }

  try {
    const stats = fs.statSync(filepath);
    
    // Check if file is empty
    if (stats.size === 0) {
      return res.status(404).json({
        status: 'error',
        code: 'EMPTY_FILE',
        message: 'Receipt file is empty',
        details: {
          filename,
          help: 'The receipt file exists but contains no data. Please try uploading the receipt again.'
        }
      });
    }

    // Set appropriate content type based on file extension
    const mimeTypes = {
      '.pdf': 'application/pdf',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png'
    };

    const contentType = mimeTypes[fileExtension] || 'application/octet-stream';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Length', stats.size);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    
    // Stream the file
    const fileStream = fs.createReadStream(filepath);
    
    fileStream.on('error', (error) => {
      console.error('Error reading receipt file:', error);
      res.status(500).json({
        status: 'error',
        code: 'FILE_READ_ERROR',
        message: 'Failed to read receipt file',
        details: {
          filename,
          error: error.message,
          help: 'There was an error reading the receipt file. Please try again or contact support if the issue persists.'
        }
      });
    });

    fileStream.on('open', () => {
      fileStream.pipe(res);
    });

    res.on('error', (error) => {
      fileStream.destroy();
      console.error('Error streaming receipt file:', error);
      res.status(500).json({
        status: 'error',
        code: 'STREAM_ERROR',
        message: 'Failed to stream receipt file',
        details: {
          filename,
          error: error.message,
          help: 'There was an error streaming the receipt file. Please try again or contact support if the issue persists.'
        }
      });
    });

  } catch (error) {
    console.error('Error serving receipt file:', error);
    res.status(500).json({
      status: 'error',
      code: 'SERVER_ERROR',
      message: 'Failed to serve receipt file',
      details: {
        filename,
        error: error.message,
        help: 'An unexpected error occurred while processing your request. Please try again or contact support if the issue persists.'
      }
    });
  }
});

// Add expense
router.post('/', authenticateToken, expenseUpload, async (req, res) => {
  try {
    // First fetch the user's complete profile
    const [userRows] = await db.promise().query(
      'SELECT name, id, employee_id, designation, department FROM users WHERE id = ?',
      [req.user.id]
    );

    if (userRows.length === 0) {
      return res.status(404).json({
        status: 'error',
        code: 'USER_NOT_FOUND',
        message: 'User profile not found. Please ensure you are properly logged in.'
      });
    }

    const userProfile = userRows[0];

    const expense = {
      ...req.body,
      user_id: req.user.id,
      status: 'pending',
    };

    // Validate required fields
    const requiredFields = ['journeyDate', 'siteName', 'unit'];
    const missingFields = requiredFields.filter(field => !expense[field]);
    
    if (missingFields.length > 0) {
      return res.status(400).json({
        status: 'error',
        code: 'MISSING_REQUIRED_FIELDS',
        message: 'Required fields are missing',
        details: {
          missingFields: missingFields,
          help: 'Please provide all required fields: journey date, site name, and unit'
        }
      });
    }

    // Format dates for MySQL
    const journeyDate = expense.journeyDate ? new Date(expense.journeyDate).toISOString().split('T')[0] : null;
    const returnDate = expense.returnDate ? new Date(expense.returnDate).toISOString().split('T')[0] : null;

    // Validate date logic
    if (returnDate && new Date(journeyDate) > new Date(returnDate)) {
      return res.status(400).json({
        status: 'error',
        code: 'INVALID_DATE_RANGE',
        message: 'Journey date cannot be after return date',
        details: {
          journeyDate,
          returnDate,
          help: 'Please ensure the journey date is before or equal to the return date'
        }
      });
    }

    // Validate total amount is not 0
    const total_expense = (
      Number(expense.trainFare || 0) + 
      Number(expense.hotelFare || 0) + 
      Number(expense.foodCost || 0)
    );

    if (total_expense === 0) {
      return res.status(400).json({
        status: 'error',
        code: 'ZERO_EXPENSE_AMOUNT',
        message: 'Total expense amount cannot be zero',
        details: {
          trainFare: expense.trainFare || 0,
          hotelFare: expense.hotelFare || 0,
          foodCost: expense.foodCost || 0,
          help: 'Please provide at least one non-zero expense amount'
        }
      });
    }

    // Check for duplicate or overlapping expenses
    const [existingExpenses] = await db.promise().query(
      `SELECT id, journey_date, return_date FROM expenses 
       WHERE user_id = ? 
       AND status != 'rejected'
       AND (
         (journey_date BETWEEN ? AND ? OR return_date BETWEEN ? AND ?)
         OR (? BETWEEN journey_date AND return_date OR ? BETWEEN journey_date AND return_date)
       )`,
      [req.user.id, journeyDate, returnDate, journeyDate, returnDate, journeyDate, returnDate]
    );

    if (existingExpenses.length > 0) {
      return res.status(400).json({
        status: 'error',
        code: 'OVERLAPPING_DATES',
        message: 'Date range overlaps with existing expenses',
        details: {
          currentExpense: {
            journeyDate,
            returnDate
          },
          existingExpenses: existingExpenses.map(exp => ({
            id: exp.id,
            journeyDate: exp.journey_date,
            returnDate: exp.return_date
          })),
          help: 'Please choose a different date range that does not overlap with existing expenses'
        }
      });
    }

    // Check if project exists and create it if it doesn't
    if (expense.projectId && expense.projectName) {
      const [existingProject] = await db.promise().query(
        'SELECT * FROM projects WHERE project_id = ?',
        [expense.projectId]
      );

      if (!existingProject || existingProject.length === 0) {
        // Create the project
        await db.promise().query(
          'INSERT INTO projects (project_id, project_name) VALUES (?, ?)',
          [expense.projectId, expense.projectName]
        );
      }
    }

    // Save transport modes to transport_modes table
    await Promise.all([
      saveTransportMode(expense.transportMode),
      saveTransportMode(expense.returnTransportMode)
    ]);

    const hotelReceiptPath = req.files?.hotelReceipt?.[0]?.filename;
    const foodReceiptPath = req.files?.foodReceipt?.[0]?.filename;
    const transportReceiptPath = req.files?.transportReceipt?.[0]?.filename;

    const query = `
      INSERT INTO expenses (
        user_id, employee_name, employee_id, designation, department,
        site_name, unit, journey_date, transport_mode, 
        return_transport_mode, return_date, advance_amount, train_fare, 
        hotel_fare, food_cost, total_expense, status, hotel_receipt, 
        food_receipt, transport_receipt, project_id, project_name
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const values = [
      expense.user_id,
      userProfile.name,
      userProfile.employee_id,
      userProfile.designation || 'Employee',
      userProfile.department || 'General',
      expense.siteName,
      expense.unit,
      journeyDate,
      expense.transportMode,
      expense.returnTransportMode,
      returnDate,
      Number(expense.advanceAmount || 0),
      Number(expense.trainFare || 0),
      Number(expense.hotelFare || 0),
      Number(expense.foodCost || 0),
      total_expense,
      expense.status,
      hotelReceiptPath,
      foodReceiptPath,
      transportReceiptPath,
      expense.projectId,
      expense.projectName
    ];

    const [result] = await db.promise().query(query, values);

    // Insert into expense history
    const historyQuery = `
      INSERT INTO expense_history (
        expense_id,
        status,
        previous_status,
        coordinator_comment,
        changed_by,
        changed_at,
        project_id,
        project_name
      ) VALUES (?, ?, ?, ?, ?, NOW(), ?, ?)
    `;

    await db.promise().query(historyQuery, [
      result.insertId,
      'pending',
      null,
      'Expense created',
      req.user.id,
      expense.projectId,
      expense.projectName
    ]);

    res.status(201).json({
      message: 'Expense added successfully',
      id: result.insertId
    });

  } catch (error) {
    console.error('Error adding expense:', error);
    res.status(500).json({ error: 'Failed to add expense' });
  }
});

// Get single expense
router.get('/:id', authenticateToken, async (req, res) => {
  const promisePool = db.promise();
  
  try {
    const expenseId = req.params.id;
    
    // Get expense details with user information and department details
    const [expenseRows] = await promisePool.query(`
      SELECT 
        e.*,
        CONCAT(u.first_name, ' ', u.last_name) as employee_name,
        u.employee_id,
        u.designation,
        u.department,
        u.email as employee_email,
        u.phone as employee_phone,
        CONCAT(c.first_name, ' ', c.last_name) as coordinator_name,
        c.email as coordinator_email,
        c.department as coordinator_department,
        CONCAT(h.first_name, ' ', h.last_name) as hr_reviewer_name,
        h.email as hr_email,
        CONCAT(a.first_name, ' ', a.last_name) as accounts_reviewer_name,
        a.email as accounts_email,
        p.project_name,
        p.site_name as project_site,
        p.unit as project_unit,
        p.status as project_status,
        d.name as department_name,
        d.head as department_head
      FROM expenses e
      LEFT JOIN users u ON e.user_id = u.id
      LEFT JOIN users c ON e.coordinator_reviewer_id = c.id
      LEFT JOIN users h ON e.hr_reviewer_id = h.id
      LEFT JOIN users a ON e.accounts_reviewer_id = a.id
      LEFT JOIN projects p ON e.project_id = p.project_id
      LEFT JOIN departments d ON u.department = d.id
      WHERE e.id = ?
    `, [expenseId]);

    if (expenseRows.length === 0) {
      return res.status(404).json({ error: 'Expense not found' });
    }

    const expense = expenseRows[0];

    // Get complete expense history with reviewer details
    const [historyRows] = await promisePool.query(`
      SELECT 
        eh.*,
        CONCAT(c.first_name, ' ', c.last_name) as reviewer_name,
        c.role as reviewer_role,
        c.department as reviewer_department,
        c.email as reviewer_email,
        d.name as department_name
      FROM expense_history eh
      LEFT JOIN users c ON eh.changed_by = c.id
      LEFT JOIN departments d ON c.department = d.id
      WHERE eh.expense_id = ?
      ORDER BY eh.changed_at DESC
    `, [expenseId]);

    // Format history entries with detailed information
    const formattedHistory = historyRows.map(entry => {
      let actionDescription = '';
      let statusChange = '';
      let statusColor = '';
      
      // Determine the type of action and status color
      if (entry.previous_status === entry.status) {
        actionDescription = 'Updated expense details';
        statusColor = 'blue';
      } else {
        if (entry.status === 'pending') {
          actionDescription = 'Submitted for review';
          statusColor = 'orange';
        } else if (entry.status === 'approved') {
          actionDescription = `Approved by ${entry.reviewer_role}`;
          statusColor = 'green';
        } else if (entry.status === 'rejected') {
          actionDescription = `Rejected by ${entry.reviewer_role}`;
          statusColor = 'red';
        } else if (entry.status === 'revision_requested') {
          actionDescription = `Revision requested by ${entry.reviewer_role}`;
          statusColor = 'yellow';
        }
        
        statusChange = `${entry.previous_status} → ${entry.status}`;
      }

      // Parse and format the changes
      let formattedChanges = null;
      if (entry.changes) {
        const changes = JSON.parse(entry.changes);
        formattedChanges = Object.entries(changes).map(([field, value]) => ({
          field: field.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
          oldValue: value[0],
          newValue: value[1]
        }));
      }

      // Format the history entry
      return {
        id: entry.id,
        timestamp: entry.changed_at,
        action: actionDescription,
        statusChange: statusChange,
        statusColor: statusColor,
        reviewer: {
          name: entry.reviewer_name,
          role: entry.reviewer_role,
          department: entry.reviewer_department,
          departmentName: entry.department_name,
          email: entry.reviewer_email
        },
        comments: {
          coordinator: entry.coordinator_comment,
          hr: entry.hr_comment,
          accounts: entry.accounts_comment
        },
        projectDetails: {
          id: entry.project_id,
          name: entry.project_name
        },
        changes: formattedChanges
      };
    });

    // Get file URLs if they exist
    const fileBaseUrl = 'http://localhost:5000/uploads/';
    const files = {
      hotelReceipt: expense.hotel_receipt ? {
        url: fileBaseUrl + expense.hotel_receipt,
        filename: expense.hotel_receipt,
        uploadedAt: expense.hotel_receipt_uploaded_at
      } : null,
      foodReceipt: expense.food_receipt ? {
        url: fileBaseUrl + expense.food_receipt,
        filename: expense.food_receipt,
        uploadedAt: expense.food_receipt_uploaded_at
      } : null,
      transportReceipt: expense.transport_receipt ? {
        url: fileBaseUrl + expense.transport_receipt,
        filename: expense.transport_receipt,
        uploadedAt: expense.transport_receipt_uploaded_at
      } : null
    };

    // Calculate time spent in each stage and approval flow metrics
    const timeInStages = {
      totalProcessingTime: null,
      coordinatorReviewTime: null,
      hrReviewTime: null,
      accountsReviewTime: null,
      averageResponseTime: null,
      bottlenecks: [],
      status: {
        coordinator: 'pending',
        hr: 'pending',
        accounts: 'pending'
      }
    };

    if (historyRows.length > 0) {
      const submissionDate = new Date(historyRows[historyRows.length - 1].changed_at);
      const completionDate = expense.status === 'approved' || expense.status === 'rejected' 
        ? new Date(expense.updated_at) 
        : null;

      if (completionDate) {
        timeInStages.totalProcessingTime = Math.round((completionDate - submissionDate) / (1000 * 60 * 60 * 24)); // in days
      }

      // Calculate review times and identify bottlenecks
      let totalReviewTime = 0;
      let reviewCount = 0;

      historyRows.forEach((entry, index) => {
        if (index < historyRows.length - 1) {
          const currentDate = new Date(entry.changed_at);
          const previousDate = new Date(historyRows[index + 1].changed_at);
          const timeSpent = Math.round((currentDate - previousDate) / (1000 * 60 * 60 * 24));

          if (timeSpent > 0) {
            totalReviewTime += timeSpent;
            reviewCount++;
          }

          if (entry.reviewer_role === 'coordinator') {
            timeInStages.coordinatorReviewTime = (timeInStages.coordinatorReviewTime || 0) + timeSpent;
            timeInStages.status.coordinator = entry.status;
          } else if (entry.reviewer_role === 'hr') {
            timeInStages.hrReviewTime = (timeInStages.hrReviewTime || 0) + timeSpent;
            timeInStages.status.hr = entry.status;
          } else if (entry.reviewer_role === 'accounts') {
            timeInStages.accountsReviewTime = (timeInStages.accountsReviewTime || 0) + timeSpent;
            timeInStages.status.accounts = entry.status;
          }

          // Identify bottlenecks (stages taking more than 2 days)
          if (timeSpent > 2) {
            timeInStages.bottlenecks.push({
              stage: entry.reviewer_role,
              timeSpent: timeSpent,
              from: previousDate,
              to: currentDate
            });
          }
        }
      });

      // Calculate average response time
      if (reviewCount > 0) {
        timeInStages.averageResponseTime = Math.round(totalReviewTime / reviewCount);
      }
    }

    // Format the response
    const response = {
      expense: {
        id: expense.id,
        status: expense.status,
        projectDetails: {
          id: expense.project_id,
          name: expense.project_name,
          site: expense.project_site,
          unit: expense.project_unit,
          status: expense.project_status
        },
        employeeDetails: {
          name: expense.employee_name,
          id: expense.employee_id,
          designation: expense.designation,
          department: expense.department_name,
          departmentHead: expense.department_head,
          email: expense.employee_email,
          phone: expense.employee_phone
        },
        expenseDetails: {
          journeyDate: expense.journey_date,
          returnDate: expense.return_date,
          transportMode: expense.transport_mode,
          returnTransportMode: expense.return_transport_mode,
          advanceAmount: expense.advance_amount,
          trainFare: expense.train_fare,
          hotelFare: expense.hotel_fare,
          foodCost: expense.food_cost,
          totalExpense: expense.total_expense
        },
        reviewDetails: {
          coordinator: {
            name: expense.coordinator_name,
            email: expense.coordinator_email,
            department: expense.coordinator_department,
            comment: expense.coordinator_comment,
            reviewedAt: expense.coordinator_reviewed_at
          },
          hr: {
            name: expense.hr_reviewer_name,
            email: expense.hr_email,
            comment: expense.hr_comment,
            reviewedAt: expense.hr_reviewed_at
          },
          accounts: {
            name: expense.accounts_reviewer_name,
            email: expense.accounts_email,
            comment: expense.accounts_comment,
            reviewedAt: expense.accounts_reviewed_at
          }
        },
        files: files,
        timestamps: {
          created: expense.created_at,
          updated: expense.updated_at,
          lastModified: expense.updated_at
        },
        processingMetrics: timeInStages
      },
      history: formattedHistory
    };

    res.json(response);
  } catch (error) {
    console.error('Error fetching expense details:', error);
    res.status(500).json({ error: 'Failed to fetch expense details', details: error.message });
  }
});

// Get all expenses
router.get('/', authenticateToken, (req, res) => {
  let query;
  let params = [];
  let conditions = [];
  
  console.log('User data:', {
    id: req.user.id,
    role: req.user.role,
    department: req.user.department
  });
  
  // Regular users can only see their own expenses
  if (req.user.role === 'user') {
    conditions.push('e.user_id = ?');
    params.push(req.user.id);
    console.log('Added user filter condition');
  }
  // Add department filtering for coordinators
  else if (req.user.role === 'coordinator') {
    conditions.push('(u.department = ? OR u.department IS NULL)');
    params.push(req.user.department);
    console.log('Added coordinator department conditions:', conditions);
  }
  // HR can only see coordinator approved expenses
  else if (req.user.role === 'hr') {
    conditions.push('e.status IN ("coordinator_approved", "hr_approved", "hr_rejected", "accounts_approved", "accounts_rejected")');
    console.log('Added HR status conditions');
  }
  // Accounts can only see HR approved expenses
  else if (req.user.role === 'accounts') {
    conditions.push('e.status IN ("hr_approved", "accounts_approved", "accounts_rejected")');
    console.log('Added Accounts status conditions');
  }

  // Add status filtering if provided
  if (req.query.status) {
    conditions.push('e.status = ?');
    params.push(req.query.status);
  }

  // Add date range filtering if provided
  if (req.query.startDate) {
    conditions.push('e.journey_date >= ?');
    params.push(req.query.startDate);
  }
  if (req.query.endDate) {
    conditions.push('e.journey_date <= ?');
    params.push(req.query.endDate);
  }

  // Construct WHERE clause if there are conditions
  const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

  query = `
    SELECT 
      e.*,
      u.id as user_id,
      u.name as employee_name,
      u.employee_id as employee_id,
      u.designation as designation,
      u.department as department,
      COALESCE(cu.name, hu.name) as reviewer_name,
      COALESCE(cu.role, hu.role) as reviewer_role,
      cu.name as coordinator_name,
      hu.name as hr_name
    FROM expenses e
    LEFT JOIN users u ON e.user_id = u.id
    LEFT JOIN users cu ON e.coordinator_reviewer_id = cu.id
    LEFT JOIN users hu ON e.hr_reviewer_id = hu.id
    ${whereClause}
    ORDER BY e.created_at DESC
  `;

  console.log('Final query:', query);
  console.log('Query params:', params);

  db.query(query, params, (err, results) => {
    if (err) {
      console.error('Error fetching expenses:', err);
      return res.status(500).json({ error: 'Error fetching expenses' });
    }
      
    // Format the results to include user object
    const formattedResults = results.map(row => ({
      ...row,
      user: {
        id: row.user_id,
        name: row.employee_name,
        employee_id: row.employee_id,
        designation: row.designation,
        department: row.department
      }
    }));
      
    console.log('Number of results:', results.length);
    res.json(formattedResults);
  });
});

// Get expense history
router.get('/:id/history', authenticateToken, async (req, res) => {
  try {
    const expenseId = req.params.id;
    console.log('Fetching history for expense ID:', expenseId);
    
    // First check if the expense exists
    const [expense] = await db.promise().query(
      'SELECT id FROM expenses WHERE id = ?',
      [expenseId]
    );

    if (!expense || expense.length === 0) {
      console.log('No expense found with ID:', expenseId);
      return res.status(404).json({ error: 'Expense not found' });
    }

    console.log('Found expense:', expense);

    // Check if expense_history table exists and has records
    const [tableCheck] = await db.promise().query(`
      SELECT COUNT(*) as count 
      FROM expense_history 
      WHERE expense_id = ?
    `, [expenseId]);
    
    console.log('History records count:', tableCheck[0].count);

    const query = `
      SELECT 
        eh.*,
        COALESCE(u.name, 
          CASE 
            WHEN eh.changed_by IS NOT NULL THEN (SELECT name FROM users WHERE id = eh.changed_by)
            WHEN eh.hr_reviewer_id IS NOT NULL THEN (SELECT name FROM users WHERE id = eh.hr_reviewer_id)
            WHEN eh.accounts_reviewer_id IS NOT NULL THEN (SELECT name FROM users WHERE id = eh.accounts_reviewer_id)
            WHEN eh.coordinator_reviewer_id IS NOT NULL THEN (SELECT name FROM users WHERE id = eh.coordinator_reviewer_id)
            ELSE NULL
          END
        ) as changed_by_name,
        COALESCE(u.role,
          CASE 
            WHEN eh.changed_by IS NOT NULL THEN (SELECT role FROM users WHERE id = eh.changed_by)
            WHEN eh.hr_reviewer_id IS NOT NULL THEN 'HR'
            WHEN eh.accounts_reviewer_id IS NOT NULL THEN 'Accounts'
            WHEN eh.coordinator_reviewer_id IS NOT NULL THEN 'Coordinator'
            ELSE NULL
          END
        ) as changed_by_role,
        DATE_FORMAT(eh.changed_at, '%Y-%m-%d %H:%i:%s') as changed_at
      FROM expense_history eh
      LEFT JOIN users u ON eh.changed_by = u.id
      WHERE eh.expense_id = ?
      ORDER BY eh.changed_at DESC
    `;

    const [history] = await db.promise().query(query, [expenseId]);
    console.log('Found history records:', history);
    
    // Transform the data for better frontend display
    const formattedHistory = history.map(item => ({
      ...item,
      id: item.id,
      status: item.status,
      changed_by_name: item.changed_by_name || 'Unknown User',
      changed_by_role: item.changed_by_role || 'Unknown Role',
      changed_at: item.changed_at,
      coordinator_comment: item.coordinator_comment,
      hr_comment: item.hr_comment,
      accounts_comment: item.accounts_comment
    }));

    res.json(formattedHistory);
  } catch (error) {
    console.error('Error in history endpoint:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Coordinator review
router.post('/:id/coordinator-review', authenticateToken, checkRole(['coordinator']), (req, res) => {
  const { status, comment } = req.body;
  const expenseId = req.params.id;

  if (!status || !comment) {
    return res.status(400).json({ message: 'Status and comment are required' });
  }

  if (!['coordinator_approved', 'coordinator_rejected'].includes(status)) {
    return res.status(400).json({ message: 'Invalid status' });
  }

  // First check if the expense belongs to coordinator's department or has no department
  const checkDepartmentQuery = `
    SELECT id FROM expenses 
    WHERE id = ? 
    AND (department = ? OR department IS NULL)
    AND status = 'pending'
  `;

  db.query(checkDepartmentQuery, [expenseId, req.user.department], (err, results) => {
    if (err) {
      console.error('Error checking expense department:', err);
      return res.status(500).json({ error: 'Error checking expense department' });
    }

    if (results.length === 0) {
      return res.status(403).json({ error: 'Not authorized to review this expense or expense not in pending status' });
    }

    const updateQuery = `
      UPDATE expenses
      SET status = ?,
          coordinator_comment = ?,
          coordinator_reviewed_at = CURRENT_TIMESTAMP,
          coordinator_reviewer_id = ?,
          updated_by = ?
      WHERE id = ?
    `;

    db.query(updateQuery, [status, comment, req.user.id, req.user.id, expenseId], (err) => {
      if (err) {
        console.error('Error updating expense status:', err);
        return res.status(500).json({ error: 'Error updating expense status' });
      }
      res.json({ message: 'Status updated successfully' });
    });
  });
});

// HR review
router.post('/:id/hr-review', authenticateToken, checkRole(['hr']), (req, res) => {
  const { status, comment } = req.body;
  const expenseId = req.params.id;

  if (!status || !comment) {
    return res.status(400).json({ message: 'Status and comment are required' });
  }

  if (!['hr_approved', 'hr_rejected'].includes(status)) {
    return res.status(400).json({ message: 'Invalid status' });
  }

  // Check if expense exists and is coordinator approved
  const checkStatusQuery = `
    SELECT id FROM expenses 
    WHERE id = ? AND status = 'coordinator_approved'
  `;

  db.query(checkStatusQuery, [expenseId], (err, results) => {
    if (err) {
      console.error('Error checking expense status:', err);
      return res.status(500).json({ error: 'Error checking expense status' });
    }

    if (results.length === 0) {
      return res.status(403).json({ error: 'Expense must be coordinator approved before HR review' });
    }

    const updateQuery = `
      UPDATE expenses
      SET status = ?,
          hr_comment = ?,
          hr_reviewed_at = CURRENT_TIMESTAMP,
          hr_reviewer_id = ?,
          updated_by = ?
      WHERE id = ?
    `;

    db.query(updateQuery, [status, comment, req.user.id, req.user.id, expenseId], (err) => {
      if (err) {
        console.error('Error updating expense status:', err);
        return res.status(500).json({ error: 'Error updating expense status' });
      }
      res.json({ message: 'Status updated successfully' });
    });
  });
});

// Accounts review
router.post('/:id/accounts-review', authenticateToken, checkRole(['accounts']), (req, res) => {
  const { status, comment } = req.body;
  const expenseId = req.params.id;

  if (!status || !comment) {
    return res.status(400).json({ message: 'Status and comment are required' });
  }

  if (!['accounts_approved', 'accounts_rejected'].includes(status)) {
    return res.status(400).json({ message: 'Invalid status' });
  }

  const query = `
    UPDATE expenses
    SET status = ?,
        accounts_comment = ?,
        accounts_reviewed_at = CURRENT_TIMESTAMP,
        accounts_reviewer_id = ?,
        updated_by = ?
    WHERE id = ? AND status = 'hr_approved'
  `;

  db.query(query, [status, comment, req.user.id, req.user.id, expenseId], (err) => {
    if (err) {
      console.error('Error updating expense status:', err);
      return res.status(500).json({ error: 'Error updating expense status' });
    }
    res.json({ message: 'Status updated successfully' });
  });
});

// Update expense
router.put('/:id', authenticateToken, expenseUpload, async (req, res) => {
  const promisePool = db.promise();
  
  try {
    await promisePool.beginTransaction();
    
    const expenseId = req.params.id;
    const userId = req.user.id;
    
    console.log('Request body:', req.body);
    console.log('Files:', req.files);
    
    // Get current expense
    const [currentExpenseRows] = await promisePool.query(
      'SELECT * FROM expenses WHERE id = ?',
      [expenseId]
    );
    
    if (currentExpenseRows.length === 0) {
      throw new Error('Expense not found');
    }
    
    const currentExpense = currentExpenseRows[0];
    console.log('Current expense:', currentExpense);
    
    // Build update query dynamically based on changed fields
    const updates = [];
    const values = [];
    
    // Handle file uploads
    let filesUpdated = false;
    if (req.files) {
      if (req.files.hotelReceipt) {
        updates.push('hotel_receipt = ?');
        values.push(req.files.hotelReceipt[0].filename);
        filesUpdated = true;
      }
      if (req.files.foodReceipt) {
        updates.push('food_receipt = ?');
        values.push(req.files.foodReceipt[0].filename);
        filesUpdated = true;
      }
      if (req.files.transportReceipt) {
        updates.push('transport_receipt = ?');
        values.push(req.files.transportReceipt[0].filename);
        filesUpdated = true;
      }
    }
    
    // Map frontend field names to database field names
    const fieldMapping = {
      projectId: 'project_id',
      projectName: 'project_name',
      siteName: 'site_name',
      unit: 'unit',
      journeyDate: 'journey_date',
      returnDate: 'return_date',
      transportMode: 'transport_mode',
      returnTransportMode: 'return_transport_mode',
      advanceAmount: 'advance_amount',
      trainFare: 'train_fare',
      hotelFare: 'hotel_fare',
      foodCost: 'food_cost'
    };
    
    // Handle each field from the request body
    Object.entries(fieldMapping).forEach(([frontendField, dbField]) => {
      if (req.body[frontendField] !== undefined && req.body[frontendField] !== '') {
        updates.push(`${dbField} = ?`);
        
        // Handle date fields
        if (frontendField === 'journeyDate' || frontendField === 'returnDate') {
          values.push(new Date(req.body[frontendField]));
        }
        // Handle numeric fields
        else if (['advanceAmount', 'trainFare', 'hotelFare', 'foodCost'].includes(frontendField)) {
          values.push(Number(req.body[frontendField]));
        }
        // Handle other fields
        else {
          values.push(req.body[frontendField]);
        }
      }
    });
    
    // Always update status to pending and modified timestamp
    updates.push('status = ?');
    values.push('pending');
    
    updates.push('updated_at = ?');
    values.push(new Date());

    updates.push('updated_by = ?');
    values.push(userId);
    
    // Calculate total expense using the new values if provided, otherwise use current values
    const totalExpense = 
      Number(req.body.trainFare || currentExpense.train_fare || 0) +
      Number(req.body.hotelFare || currentExpense.hotel_fare || 0) +
      Number(req.body.foodCost || currentExpense.food_cost || 0);
    
    updates.push('total_expense = ?');
    values.push(totalExpense);

    // Reset review fields when updating
    updates.push('coordinator_comment = NULL');
    updates.push('coordinator_reviewed_at = NULL');
    updates.push('coordinator_reviewer_id = NULL');
    updates.push('hr_comment = NULL');
    updates.push('hr_reviewed_at = NULL');
    updates.push('hr_reviewer_id = NULL');
    updates.push('accounts_comment = NULL');
    updates.push('accounts_reviewed_at = NULL');
    updates.push('accounts_reviewer_id = NULL');
    
    // Add expense ID as the last parameter for the update
    values.push(expenseId);
    
    // Update the expense
    const updateQuery = `
      UPDATE expenses 
      SET ${updates.join(', ')}
      WHERE id = ?
    `;
    
    console.log('Update Query:', updateQuery);
    console.log('Update Values:', values);
    
    const [updateResult] = await promisePool.query(updateQuery, values);
    console.log('Update result:', updateResult);

    // Add to expense history
    const historyComment = filesUpdated ? 
      'Status automatically reset to pending due to file update' : 
      'Expense updated and status set to pending';

    const [historyResult] = await promisePool.query(
      `INSERT INTO expense_history 
       (expense_id, status, previous_status, coordinator_comment, 
        changed_by, changed_at, project_id, project_name)
       VALUES (?, ?, ?, ?, ?, NOW(), ?, ?)`,
      [
        expenseId,
        'pending',
        currentExpense.status,
        historyComment,
        userId,
        req.body.projectId || currentExpense.project_id,
        req.body.projectName || currentExpense.project_name
      ]
    );
    console.log('History result:', historyResult);
    
    // Get updated expense
    const [updatedExpenseRows] = await promisePool.query(
      'SELECT * FROM expenses WHERE id = ?',
      [expenseId]
    );
    
    console.log('Updated expense:', updatedExpenseRows[0]);
    
    await promisePool.commit();
    
    res.json(updatedExpenseRows[0]);
  } catch (error) {
    await promisePool.rollback();
    console.error('Error updating expense:', error);
    console.error('Error details:', error.message);
    if (error.sql) {
      console.error('SQL Query:', error.sql);
    }
    res.status(500).json({ error: 'Failed to update expense', details: error.message });
  }
});

// Update expense status
router.put('/:id/status', authenticateToken, async (req, res) => {
  const { status, comment } = req.body;
  const { id } = req.params;
  const userId = req.user.id;
  console.log('Updating expense status:', { id, status, comment, userId });

  try {
    let updateFields = { status };
    let commentField = '';

    // Determine which comment field to update based on user role
    switch (req.user.role) {
      case 'hr':
        updateFields.hr_comment = comment;
        updateFields.hr_reviewer_id = userId;
        updateFields.hr_reviewed_at = new Date();
        commentField = 'hr_comment';
        break;
      case 'accounts':
        updateFields.accounts_comment = comment;
        updateFields.accounts_reviewer_id = userId;
        updateFields.accounts_reviewed_at = new Date();
        commentField = 'accounts_comment';
        break;
      case 'coordinator':
        updateFields.coordinator_comment = comment;
        updateFields.coordinator_reviewer_id = userId;
        updateFields.coordinator_reviewed_at = new Date();
        commentField = 'coordinator_comment';
        break;
      default:
        return res.status(403).json({ error: 'Unauthorized role' });
    }

    // Add updated_by field
    updateFields.updated_by = userId;
    console.log('Update fields:', updateFields);

    // Get the current expense data before update
    const [currentExpense] = await db.query('SELECT * FROM expenses WHERE id = ?', [id]);
    console.log('Current expense:', currentExpense);
    
    if (!currentExpense || currentExpense.length === 0) {
      return res.status(404).json({ error: 'Expense not found' });
    }

    // Insert into history table directly
    const historyResult = await db.query(
      `INSERT INTO expense_history (
        expense_id,
        changed_by,
        status,
        previous_status,
        comment,
        changed_at
      ) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      [
        id,
        userId,
        status,
        currentExpense[0].status,
        comment
      ]
    );
    console.log('History insert result:', historyResult);

    // Update the expense
    const updateResult = await db.query(
      'UPDATE expenses SET ? WHERE id = ?',
      [updateFields, id]
    );
    console.log('Expense update result:', updateResult);

    res.json({ 
      message: 'Expense status updated successfully',
      status: status,
      [commentField]: comment 
    });
  } catch (error) {
    console.error('Error in expense update:', error);
    res.status(500).json({ 
      error: 'Error updating expense', 
      details: error.message 
    });
  }
});

module.exports = router;
