const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { authenticateToken: auth } = require('../middleware/auth');

// Create or update transport mode
router.post('/', auth, async (req, res) => {
    try {
        const { modeName } = req.body;

        if (!modeName) {
            return res.status(400).json({ message: 'Transport mode name is required' });
        }

        await db.promise().query(
            'INSERT INTO transport_modes (mode_name) VALUES (?) ON DUPLICATE KEY UPDATE mode_name = VALUES(mode_name)',
            [modeName]
        );

        res.status(201).json({ message: 'Transport mode saved successfully' });
    } catch (error) {
        console.error('Error in transport mode operation:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Validate and auto-complete transport mode
router.get('/validate', auth, async (req, res) => {
    try {
        const { mode } = req.query;
        
        if (!mode) {
            return res.status(400).json({ message: 'Mode parameter is required' });
        }

        // First check for exact match
        const [exactMatch] = await db.promise().query(
            'SELECT mode_name FROM transport_modes WHERE mode_name = ?',
            [mode]
        );

        if (exactMatch.length > 0) {
            return res.json({ isValid: true, mode: exactMatch[0].mode_name });
        }

        // Then check for partial matches
        const [partialMatches] = await db.promise().query(
            `SELECT mode_name FROM transport_modes 
             WHERE mode_name LIKE ? 
             ORDER BY 
               CASE 
                 WHEN mode_name LIKE ? THEN 1
                 WHEN mode_name LIKE ? THEN 2
                 ELSE 3
               END,
               LENGTH(mode_name),
               mode_name 
             LIMIT 1`,
            [
                `%${mode}%`,     // Contains anywhere
                `${mode}%`,      // Starts with (highest priority)
                `% ${mode}%`     // Contains after space (medium priority)
            ]
        );

        if (partialMatches.length > 0) {
            return res.json({ 
                isValid: false, 
                suggestion: partialMatches[0].mode_name 
            });
        }

        return res.json({ isValid: false });
    } catch (error) {
        console.error('Error validating transport mode:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Search transport modes
router.get('/search', auth, async (req, res) => {
    try {
        const { query } = req.query;
        
        if (!query) {
            const [allModes] = await db.promise().query(
                'SELECT mode_name FROM transport_modes ORDER BY mode_name LIMIT 10'
            );
            return res.json(allModes);
        }

        // Search with different patterns
        const [results] = await db.promise().query(
            `SELECT mode_name FROM transport_modes 
             WHERE mode_name LIKE ? 
             OR mode_name LIKE ? 
             OR mode_name LIKE ? 
             ORDER BY 
               CASE 
                 WHEN mode_name LIKE ? THEN 1
                 WHEN mode_name LIKE ? THEN 2
                 ELSE 3
               END,
               LENGTH(mode_name),
               mode_name 
             LIMIT 10`,
            [
                `${query}%`,    // Starts with
                `% ${query}%`,  // Contains after space
                `%${query}%`,   // Contains anywhere
                `${query}%`,    // For ordering: Starts with (highest priority)
                `% ${query}%`   // For ordering: Contains after space (medium priority)
            ]
        );

        res.json(results);
    } catch (error) {
        console.error('Error searching transport modes:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router;
