const express = require('express');
const multer = require('multer');
const path = require('path');
const { body, validationResult } = require('express-validator');
const jwt = require('jsonwebtoken');
const router = express.Router();
const pool = require('../config/database');
const notificationService = require('../services/notificationService');

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadPath = path.join(__dirname, '../uploads');
    cb(null, uploadPath);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit
  },
  fileFilter: function (req, file, cb) {
    // Accept images and videos
    if (file.mimetype.startsWith('image/') || file.mimetype.startsWith('video/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image and video files are allowed'));
    }
  }
});

// Middleware to verify JWT token
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Access token required'
    });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({
        success: false,
        message: 'Invalid or expired token'
      });
    }
    req.user = user;
    next();
  });
};

// Generate Unique Complaint Number
const generateUCN = () => {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substr(2, 5);
  return `UCN-${timestamp.toUpperCase()}-${random.toUpperCase()}`;
};

// Create new complaint
router.post('/', authenticateToken, upload.array('files', 10), [
  body('title').trim().isLength({ min: 3, max: 255 }).withMessage('Title must be 3-255 characters'),
  body('categoryId').isInt({ min: 1 }).withMessage('Valid category required'),
  body('description').trim().isLength({ min: 10 }).withMessage('Description must be at least 10 characters'),
  body('severity').isIn(['Low', 'Medium', 'High']).withMessage('Valid severity required'),
  body('address').trim().isLength({ min: 5 }).withMessage('Address must be at least 5 characters'),
  body('complainantName').trim().isLength({ min: 2 }).withMessage('Name must be at least 2 characters'),
  body('complainantPhone').isMobilePhone().withMessage('Valid phone number required'),
  body('latitude').optional().isFloat({ min: -90, max: 90 }).withMessage('Valid latitude required'),
  body('longitude').optional().isFloat({ min: -180, max: 180 }).withMessage('Valid longitude required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const {
      title,
      categoryId,
      description,
      severity,
      address,
      complainantName,
      complainantPhone,
      latitude,
      longitude
    } = req.body;

    const ucn = generateUCN();

    // Start transaction
    const connection = await pool.getConnection();
    await connection.beginTransaction();

    try {
      // Insert complaint
      const [complaintResult] = await connection.execute(
        `INSERT INTO complaints 
         (ucn, user_id, category_id, title, description, severity, status, latitude, longitude, address) 
         VALUES (?, ?, ?, ?, ?, ?, 'Submitted', ?, ?, ?)`,
        [ucn, req.user.userId, categoryId, title, description, severity, latitude, longitude, address]
      );

      const complaintId = complaintResult.insertId;

      // Insert media files if any
      if (req.files && req.files.length > 0) {
        for (const file of req.files) {
          const fileType = file.mimetype.startsWith('image/') ? 'image' : 'video';
          await connection.execute(
            `INSERT INTO complaint_media (complaint_id, file_name, file_path, file_type, file_size) 
             VALUES (?, ?, ?, ?, ?)`,
            [complaintId, file.originalname, file.path, fileType, file.size]
          );
        }
      }

      // Create initial status history
      await connection.execute(
        `INSERT INTO complaint_status_history (complaint_id, old_status, new_status, remarks, created_by) 
         VALUES (?, NULL, 'Submitted', 'Complaint registered successfully', ?)`,
        [complaintId, req.user.userId]
      );

      // Create notification
      await connection.execute(
        `INSERT INTO notifications (user_id, complaint_id, title, message, type) 
         VALUES (?, ?, ?, ?, 'submission')`,
        [req.user.userId, complaintId, 'Complaint Registered', `Your complaint ${ucn} has been registered successfully`, 'submission']
      );

      await connection.commit();

      // Get complaint details for notification
      const [complaintDetails] = await pool.execute(
        `SELECT c.*, cat.name as category_name, u.name as user_name, u.email as user_email
         FROM complaints c
         LEFT JOIN categories cat ON c.category_id = cat.id
         LEFT JOIN users u ON c.user_id = u.id
         WHERE c.id = ?`,
        [complaintId]
      );

      if (complaintDetails.length > 0) {
        // Send notification
        await notificationService.notifyComplaintSubmission(complaintDetails[0]);
      }

      res.status(201).json({
        success: true,
        message: 'Complaint registered successfully',
        data: {
          complaintId,
          ucn,
          status: 'Submitted'
        }
      });

    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }

  } catch (error) {
    console.error('Complaint creation error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to register complaint'
    });
  }
});

// Get complaint by UCN (public tracking)
router.get('/track/:ucn', async (req, res) => {
  try {
    const { ucn } = req.params;

    const [complaints] = await pool.execute(
      `SELECT c.*, cat.name as category_name, u.name as user_name,
              a.name as assigned_authority
       FROM complaints c
       LEFT JOIN categories cat ON c.category_id = cat.id
       LEFT JOIN users u ON c.user_id = u.id
       LEFT JOIN authorities a ON c.assigned_authority_id = a.id
       WHERE c.ucn = ?`,
      [ucn]
    );

    if (complaints.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Complaint not found'
      });
    }

    const complaint = complaints[0];

    // Get status history
    const [statusHistory] = await pool.execute(
      `SELECT csh.*, 
              CASE 
                WHEN csh.created_by IN (SELECT id FROM users) THEN 
                  (SELECT name FROM users WHERE id = csh.created_by)
                WHEN csh.created_by IN (SELECT id FROM admin_users) THEN 
                  (SELECT username FROM admin_users WHERE id = csh.created_by)
                ELSE 'System'
              END as created_by_name
       FROM complaint_status_history csh
       WHERE csh.complaint_id = ?
       ORDER BY csh.created_at DESC`,
      [complaint.id]
    );

    // Get media files
    const [media] = await pool.execute(
      `SELECT file_name, file_type, file_size, uploaded_at
       FROM complaint_media
       WHERE complaint_id = ?
       ORDER BY uploaded_at ASC`,
      [complaint.id]
    );

    res.json({
      success: true,
      data: {
        ...complaint,
        statusHistory,
        media
      }
    });

  } catch (error) {
    console.error('Track complaint error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to track complaint'
    });
  }
});

// Get user's complaints
router.get('/my', authenticateToken, async (req, res) => {
  try {
    const { page = 1, limit = 10, status, severity } = req.query;
    const offset = (page - 1) * limit;

    let whereClause = 'WHERE c.user_id = ?';
    const params = [req.user.userId];

    if (status) {
      whereClause += ' AND c.status = ?';
      params.push(status);
    }

    if (severity) {
      whereClause += ' AND c.severity = ?';
      params.push(severity);
    }

    const [complaints] = await pool.execute(
      `SELECT c.*, cat.name as category_name
       FROM complaints c
       LEFT JOIN categories cat ON c.category_id = cat.id
       ${whereClause}
       ORDER BY c.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), offset]
    );

    // Get total count
    const [countResult] = await pool.execute(
      `SELECT COUNT(*) as total FROM complaints c ${whereClause}`,
      params
    );

    const total = countResult[0].total;
    const totalPages = Math.ceil(total / limit);

    res.json({
      success: true,
      data: {
        complaints,
        pagination: {
          currentPage: parseInt(page),
          totalPages,
          total,
          limit: parseInt(limit)
        }
      }
    });

  } catch (error) {
    console.error('Get user complaints error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch complaints'
    });
  }
});

// Get single complaint details
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const [complaints] = await pool.execute(
      `SELECT c.*, cat.name as category_name, u.name as user_name, u.email as user_email,
              a.name as assigned_authority
       FROM complaints c
       LEFT JOIN categories cat ON c.category_id = cat.id
       LEFT JOIN users u ON c.user_id = u.id
       LEFT JOIN authorities a ON c.assigned_authority_id = a.id
       WHERE c.id = ? AND c.user_id = ?`,
      [id, req.user.userId]
    );

    if (complaints.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Complaint not found'
      });
    }

    const complaint = complaints[0];

    // Get status history
    const [statusHistory] = await pool.execute(
      `SELECT csh.*, 
              CASE 
                WHEN csh.created_by IN (SELECT id FROM users) THEN 
                  (SELECT name FROM users WHERE id = csh.created_by)
                WHEN csh.created_by IN (SELECT id FROM admin_users) THEN 
                  (SELECT username FROM admin_users WHERE id = csh.created_by)
                ELSE 'System'
              END as created_by_name
       FROM complaint_status_history csh
       WHERE csh.complaint_id = ?
       ORDER BY csh.created_at DESC`,
      [complaint.id]
    );

    // Get media files
    const [media] = await pool.execute(
      `SELECT id, file_name, file_type, file_size, uploaded_at
       FROM complaint_media
       WHERE complaint_id = ?
       ORDER BY uploaded_at ASC`,
      [complaint.id]
    );

    res.json({
      success: true,
      data: {
        ...complaint,
        statusHistory,
        media
      }
    });

  } catch (error) {
    console.error('Get complaint error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch complaint details'
    });
  }
});

// Get categories
router.get('/categories/list', async (req, res) => {
  try {
    const [categories] = await pool.execute(
      'SELECT id, name, description FROM categories ORDER BY name'
    );

    res.json({
      success: true,
      data: categories
    });

  } catch (error) {
    console.error('Get categories error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch categories'
    });
  }
});

// Get complaint statistics for user
router.get('/stats/my', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;

    const [stats] = await pool.execute(
      `SELECT 
         COUNT(*) as total,
         SUM(CASE WHEN status = 'Submitted' THEN 1 ELSE 0 END) as submitted,
         SUM(CASE WHEN status = 'Under Review' THEN 1 ELSE 0 END) as under_review,
         SUM(CASE WHEN status = 'Assigned to Authority' THEN 1 ELSE 0 END) as assigned,
         SUM(CASE WHEN status = 'In Progress' THEN 1 ELSE 0 END) as in_progress,
         SUM(CASE WHEN status = 'Resolved' THEN 1 ELSE 0 END) as resolved,
         SUM(CASE WHEN status = 'Escalated' THEN 1 ELSE 0 END) as escalated
       FROM complaints 
       WHERE user_id = ?`,
      [userId]
    );

    const [severityStats] = await pool.execute(
      `SELECT 
         SUM(CASE WHEN severity = 'High' THEN 1 ELSE 0 END) as high,
         SUM(CASE WHEN severity = 'Medium' THEN 1 ELSE 0 END) as medium,
         SUM(CASE WHEN severity = 'Low' THEN 1 ELSE 0 END) as low
       FROM complaints 
       WHERE user_id = ?`,
      [userId]
    );

    res.json({
      success: true,
      data: {
        ...stats[0],
        severity: severityStats[0]
      }
    });

  } catch (error) {
    console.error('Get complaint stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch complaint statistics'
    });
  }
});

module.exports = router;
