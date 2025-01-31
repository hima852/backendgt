const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { authenticateToken: auth } = require('../middleware/auth');

// Create or update project
router.post('/', auth, (req, res) => {
    try {
        const { projectId, projectName } = req.body;

        if (!projectId || !projectName) {
            return res.status(400).json({ message: 'Project ID and Project Name are required' });
        }

        // Check if project exists
        db.query(
            'SELECT * FROM projects WHERE project_id = ?',
            [projectId],
            (err, results) => {
                if (err) {
                    console.error('Error checking project:', err);
                    return res.status(500).json({ message: 'Server error' });
                }

                if (results.length > 0) {
                    // Update existing project
                    db.query(
                        'UPDATE projects SET project_name = ? WHERE project_id = ?',
                        [projectName, projectId],
                        (err) => {
                            if (err) {
                                console.error('Error updating project:', err);
                                return res.status(500).json({ message: 'Server error' });
                            }
                            res.json({ message: 'Project updated successfully' });
                        }
                    );
                } else {
                    // Create new project
                    db.query(
                        'INSERT INTO projects (project_id, project_name) VALUES (?, ?)',
                        [projectId, projectName],
                        (err) => {
                            if (err) {
                                console.error('Error creating project:', err);
                                return res.status(500).json({ message: 'Server error' });
                            }
                            res.status(201).json({ message: 'Project created successfully' });
                        }
                    );
                }
            }
        );
    } catch (error) {
        console.error('Error in project operation:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Get project by ID
router.get('/:projectId', auth, (req, res) => {
    const { projectId } = req.params;

    db.query(
        'SELECT project_id, project_name FROM projects WHERE project_id = ?',
        [projectId],
        (err, results) => {
            if (err) {
                console.error('Error fetching project:', err);
                return res.status(500).json({ message: 'Server error' });
            }

            if (results.length === 0) {
                return res.status(404).json({ message: 'Project not found' });
            }

            res.json(results[0]);
        }
    );
});

// Get all projects
router.get('/', auth, (req, res) => {
    db.query(
        'SELECT project_id, project_name FROM projects ORDER BY created_at DESC',
        (err, results) => {
            if (err) {
                console.error('Error fetching projects:', err);
                return res.status(500).json({ message: 'Server error' });
            }

            res.json(results);
        }
    );
});

module.exports = router;
