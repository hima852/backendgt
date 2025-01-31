const axios = require('axios');

async function testLogin() {
    const testCases = [
        {
            description: 'Test User Login',
            credentials: {
                email: 'test@example.com',
                password: 'test123'
            }
        },
        {
            description: 'Admin Login',
            credentials: {
                email: 'admin@company.com',
                password: 'password123'
            }
        },
        {
            description: 'Invalid Email',
            credentials: {
                email: 'nonexistent@example.com',
                password: 'wrongpass'
            }
        },
        {
            description: 'Empty Fields',
            credentials: {
                email: '',
                password: ''
            }
        }
    ];

    for (const test of testCases) {
        console.log(`\nTesting: ${test.description}`);
        try {
            const response = await axios.post('http://localhost:5000/api/auth/login', test.credentials);
            console.log('✅ Success:', response.data);
        } catch (error) {
            console.log('❌ Error:', error.response?.data || error.message);
        }
    }
}

testLogin();
