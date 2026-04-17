const pool = require('../config/db');
const fs = require('fs/promises');
const path = require('path');

exports.getTeamMembers = async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM team_members WHERE status = $1 ORDER BY id', ['active']);
        res.json({
            success: true,
            count: result.rows.length,
            data: result.rows
        });
    } catch (error) {
        console.error('Error fetching team members:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
};

exports.createTeam = async (req, res) => {
    try {
        const { name, title, bio } = req.body;
        
        const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
        const uploadDir = path.join('uploads', 'team', slug);
        await fs.mkdir(uploadDir, { recursive: true });
        
        let imagePath = null;
        const imageFile = req.files ? req.files.find(f => f.fieldname === 'image') : null;
        if (imageFile) {
            imagePath = `${process.env.APP_URL}/uploads/team/${slug}/image.jpg`;
            await fs.writeFile(path.join(uploadDir, 'image.jpg'), imageFile.buffer);
        }
        
        const result = await pool.query(
            'INSERT INTO team_members (name, title, image, bio) VALUES ($1, $2, $3, $4) RETURNING *',
            [name, title, imagePath || null, bio]
        );
        
        res.status(201).json({
            success: true,
            data: result.rows[0]
        });
    } catch (error) {
        console.error('Error creating team member:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
};

exports.updateMember = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, title, bio } = req.body;
        
        let imagePath = null;
        const imageFile = req.files ? req.files.find(f => f.fieldname === 'image') : null;
        if (imageFile) {
            const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
            const uploadDir = path.join('uploads', 'team', slug);
            await fs.mkdir(uploadDir, { recursive: true });
            imagePath = `${process.env.APP_URL}/uploads/team/${slug}/image.jpg`;
            await fs.writeFile(path.join(uploadDir, 'image.jpg'), imageFile.buffer);
        }
        
        const result = await pool.query(
            `UPDATE team_members 
             SET name = $1, title = $2, image = COALESCE($3, image), bio = $4, updated_at = CURRENT_TIMESTAMP
             WHERE id = $5 AND status = 'active' RETURNING *`,
            [name, title, imagePath, bio, id]
        );
        
        if (result.rowCount === 0) {
            return res.status(404).json({ success: false, message: 'Member not found' });
        }
        
        res.json({
            success: true,
            data: result.rows[0]
        });
    } catch (error) {
        console.error('Error updating team member:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

exports.deleteMember = async (req, res) => {
    try {
        const { id } = req.params;
        
        const result = await pool.query(
            `UPDATE team_members SET status = 'inactive', updated_at = CURRENT_TIMESTAMP 
             WHERE id = $1 AND status = 'active' RETURNING id`,
            [id]
        );
        
        if (result.rowCount === 0) {
            return res.status(404).json({ success: false, message: 'Member not found' });
        }
        
        res.json({ success: true, message: 'Member deleted successfully' });
    } catch (error) {
        console.error('Error deleting team member:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};
