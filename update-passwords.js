const mysql = require('mysql2');
const bcrypt = require('bcrypt');

const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '1234',
    database: 'expense_tracker'
});

async function updatePasswords() {
    const password = 'password123';
    const hashedPassword = await bcrypt.hash(password, 10);

    const users = [
        { email: 'admin@company.com', role: 'admin' },
        { email: 'hr.manager@company.com', role: 'hr' },
        { email: 'accounts.manager@company.com', role: 'accounts' }
    ];

    for (const user of users) {
        db.query(
            'UPDATE users SET password = ? WHERE email = ?',
            [hashedPassword, user.email],
            (err, results) => {
                if (err) {
                    console.error(`Error updating ${user.role} password:`, err);
                } else {
                    console.log(`✅ Updated password for ${user.role} (${user.email})`);
                }
            }
        );
    }

    // Wait a bit before closing connection
    setTimeout(() => {
        db.end();
        console.log('\n✨ All passwords updated to: password123');
    }, 1000);
}

updatePasswords();
