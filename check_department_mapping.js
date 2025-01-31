const mysql = require('mysql2');

const connection = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: '1234',
  database: 'expense_tracker'
});

async function checkDepartmentMapping() {
  try {
    // Get all departments
    const [departments] = await connection.promise().query('SELECT name FROM departments ORDER BY name');
    console.log('\nAll Departments:');
    console.log('----------------');
    departments.forEach(dept => console.log(dept.name));

    // Get all unique departments from users
    const [userDepts] = await connection.promise().query('SELECT DISTINCT department FROM users WHERE department IS NOT NULL ORDER BY department');
    console.log('\nDepartments in Users Table:');
    console.log('---------------------------');
    userDepts.forEach(dept => console.log(dept.department));

    // Find departments in users table that don't exist in departments table
    const [unmatchedDepts] = await connection.promise().query(`
      SELECT DISTINCT u.department 
      FROM users u 
      LEFT JOIN departments d ON u.department = d.name 
      WHERE d.name IS NULL AND u.department IS NOT NULL
    `);
    
    if (unmatchedDepts.length > 0) {
      console.log('\nWARNING: Found departments in users table that don\'t exist in departments table:');
      console.log('------------------------------------------------------------------------');
      unmatchedDepts.forEach(dept => console.log(dept.department));
    } else {
      console.log('\nSuccess: All user departments exist in departments table!');
    }

    // Count users per department
    const [userCounts] = await connection.promise().query(`
      SELECT department, COUNT(*) as count 
      FROM users 
      WHERE department IS NOT NULL 
      GROUP BY department 
      ORDER BY department
    `);
    
    console.log('\nUsers per Department:');
    console.log('--------------------');
    userCounts.forEach(row => console.log(`${row.department}: ${row.count} users`));

  } catch (error) {
    console.error('Error checking department mapping:', error);
  } finally {
    connection.end();
  }
}

checkDepartmentMapping();
