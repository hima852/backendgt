const axios = require('axios');

const employees = [
  {
    name: 'John Employee',
    email: 'employee1@test.com',
    password: 'test123',
    role: 'user',
    department: 'Sales'
  },
  {
    name: 'Jane Employee',
    email: 'employee2@test.com',
    password: 'test123',
    role: 'user',
    department: 'Marketing'
  }
];

async function registerEmployees() {
  for (const employee of employees) {
    try {
      console.log(`Attempting to register ${employee.email}...`);
      const response = await axios.post('http://localhost:5000/api/auth/register', employee);
      console.log(`Successfully registered ${employee.email}:`, response.data);
      
      // Try logging in with the new account
      console.log(`Testing login for ${employee.email}...`);
      const loginResponse = await axios.post('http://localhost:5000/api/auth/login', {
        email: employee.email,
        password: employee.password
      });
      console.log(`Successfully logged in as ${employee.email}:`, loginResponse.data);
    } catch (error) {
      console.error(`Error with ${employee.email}:`, error.response?.data || error.message);
    }
  }
}

console.log('Starting employee registration...');
registerEmployees().then(() => console.log('Finished registration process'));
