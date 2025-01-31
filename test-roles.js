const axios = require('axios');

const users = {
    admin: {
        email: 'admin@company.com',
        password: 'password123',
        expectedRole: 'admin'
    },
    hr: {
        email: 'hr.manager@company.com',
        password: 'password123',
        expectedRole: 'hr'
    },
    accounts: {
        email: 'accounts.manager@company.com',
        password: 'password123',
        expectedRole: 'accounts'
    },
    user: {
        email: 'test@example.com',
        password: 'test123',
        expectedRole: 'user'
    }
};

async function loginAndTestRole(userType, credentials) {
    console.log(`\n🔑 Testing ${userType.toUpperCase()} role:`);
    try {
        // Login
        const loginResponse = await axios.post('http://localhost:5000/api/auth/login', {
            email: credentials.email,
            password: credentials.password
        });

        const { token, user } = loginResponse.data;
        console.log('✅ Login successful');
        console.log('👤 User details:', {
            name: user.name,
            email: user.email,
            role: user.role,
            department: user.department
        });

        // Set token for subsequent requests
        const config = {
            headers: { Authorization: `Bearer ${token}` }
        };

        // Test role-specific endpoints
        try {
            // Test getting expenses (should work for all roles)
            const expensesResponse = await axios.get('http://localhost:5000/api/expenses', config);
            console.log('✅ Can view expenses');
        } catch (error) {
            console.log('❌ Cannot view expenses:', error.response?.data?.message || error.message);
        }

        // Test HR-specific endpoint
        if (user.role === 'hr' || user.role === 'admin') {
            try {
                const hrResponse = await axios.get('http://localhost:5000/api/expenses/pending/hr', config);
                console.log('✅ Can access HR endpoints');
            } catch (error) {
                console.log('❌ Cannot access HR endpoints:', error.response?.data?.message || error.message);
            }
        }

        // Test Accounts-specific endpoint
        if (user.role === 'accounts' || user.role === 'admin') {
            try {
                const accountsResponse = await axios.get('http://localhost:5000/api/expenses/pending/accounts', config);
                console.log('✅ Can access Accounts endpoints');
            } catch (error) {
                console.log('❌ Cannot access Accounts endpoints:', error.response?.data?.message || error.message);
            }
        }

        // Test Admin-specific functionality
        if (user.role === 'admin') {
            try {
                const usersResponse = await axios.get('http://localhost:5000/api/users', config);
                console.log('✅ Can access user management');
            } catch (error) {
                console.log('❌ Cannot access user management:', error.response?.data?.message || error.message);
            }
        }

    } catch (error) {
        console.log('❌ Login failed:', error.response?.data?.message || error.message);
    }
}

async function testAllRoles() {
    for (const [userType, credentials] of Object.entries(users)) {
        await loginAndTestRole(userType, credentials);
    }
}

console.log('🚀 Starting role-based access testing...');
testAllRoles().then(() => console.log('\n✨ Testing completed'));
