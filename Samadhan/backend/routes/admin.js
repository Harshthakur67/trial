const express = require('express');
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const jwt = require('jsonwebtoken');
const router = express.Router();
const pool = require('../config/database');
const escalationService = require('../services/escalationService');
const notificationService = require('../services/notificationService');

// Middleware to verify JWT token and admin role
const authenticateAdmin = (req, res, next) => {
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
    
    if (!['Super Admin', 'Department Authority', 'Moderator'].includes(user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Admin access required'
      });
    }
    
    req.user = user;
    next();
  });
};

// Get dashboard statistics
router.get('/dashboard/stats', authenticateAdmin, async (req, res) => {
  try {
    const [stats] = await pool.execute(
      `SELECT 
         COUNT(*) as total_complaints,
         SUM(CASE WHEN status = 'Submitted' THEN 1 ELSE 0 END) as submitted,
         SUM(CASE WHEN status = 'Under Review' THEN 1 ELSE 0 END) as under_review,
         SUM(CASE WHEN status = 'Assigned to Authority' THEN 1 ELSE 0 END) as assigned,
         SUM(CASE WHEN status = 'In Progress' THEN 1 ELSE 0 END) as in_progress,
         SUM(CASE WHEN status = 'Resolved' THEN 1 ELSE 0 END) as resolved,
         SUM(CASE WHEN status = 'Escalated' THEN 1 ELSE 0 END) as escalated
       FROM complaints`
    );

    const [severityStats] = await pool.execute(
      `SELECT 
         SUM(CASE WHEN severity = 'High' THEN 1 ELSE 0 END) as high,
         SUM(CASE WHEN severity = 'Medium' THEN 1 ELSE 0 END) as medium,
         SUM(CASE WHEN severity = 'Low' THEN 1 ELSE 0 END) as low
       FROM complaints`
    );

    const [categoryStats] = await pool.execute(
      `SELECT c.name, COUNT(co.id) as count
       FROM categories c
       LEFT JOIN complaints co ON c.id = co.category_id
       GROUP BY c.id, c.name
       ORDER BY count DESC`
    );

    const [resolutionTime] = await pool.execute(
      `SELECT 
         AVG(TIMESTAMPDIFF(HOUR, created_at, 
           CASE 
             WHEN status = 'Resolved' THEN updated_at
             ELSE NOW()
           END
         )) as avg_resolution_hours
       FROM complaints 
       WHERE status IN ('Resolved', 'In Progress')`
    );

    res.json({
      success: true,
      data: {
        ...stats[0],
        severity: severityStats[0],
        categories: categoryStats,
        avgResolutionHours: Math.round(resolutionTime[0].avg_resolution_hours || 0)
      }
    });

  } catch (error) {
    console.error('Dashboard stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch dashboard statistics'
    });
  }
});

// Get all complaints with filtering
router.get('/complaints', authenticateAdmin, async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 10, 
      status, 
      severity, 
      category, 
      dateFrom, 
      dateTo,
      search 
    } = req.query;
    const offset = (page - 1) * limit;

    let whereClause = 'WHERE 1=1';
    const params = [];

    if (status) {
      whereClause += ' AND c.status = ?';
      params.push(status);
    }

    if (severity) {
      whereClause += ' AND c.severity = ?';
      params.push(severity);
    }

    if (category) {
      whereClause += ' AND c.category_id = ?';
      params.push(category);
    }

    if (dateFrom) {
      whereClause += ' AND DATE(c.created_at) >= ?';
      params.push(dateFrom);
    }

    if (dateTo) {
      whereClause += ' AND DATE(c.created_at) <= ?';
      params.push(dateTo);
    }

    if (search) {
      whereClause += ' AND (c.title LIKE ? OR c.description LIKE ? OR c.ucn LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    const [complaints] = await pool.execute(
      `SELECT c.*, cat.name as category_name, u.name as user_name, u.email as user_email,
              a.name as assigned_authority
       FROM complaints c
       LEFT JOIN categories cat ON c.category_id = cat.id
       LEFT JOIN users u ON c.user_id = u.id
       LEFT JOIN authorities a ON c.assigned_authority_id = a.id
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
    console.error('Get complaints error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch complaints'
    });
  }
});

// Update complaint status
router.put('/complaints/:id/status', authenticateAdmin, [
  body('status').isIn(['Under Review', 'Assigned to Authority', 'In Progress', 'Resolved', 'Escalated']).withMessage('Valid status required'),
  body('remarks').optional().trim().isLength({ max: 1000 }).withMessage('Remarks must be less than 1000 characters'),
  body('assignedAuthorityId').optional().isInt({ min: 1 }).withMessage('Valid authority ID required')
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

    const { id } = req.params;
    const { status, remarks, assignedAuthorityId } = req.body;

    // Get current complaint
    const [complaints] = await pool.execute(
      'SELECT * FROM complaints WHERE id = ?',
      [id]
    );

    if (complaints.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Complaint not found'
      });
    }

    const complaint = complaints[0];
    const oldStatus = complaint.status;

    // Start transaction
    const connection = await pool.getConnection();
    await connection.beginTransaction();

    try {
      // Update complaint
      const updateFields = ['status = ?', 'updated_at = CURRENT_TIMESTAMP'];
      const updateValues = [status];

      if (assignedAuthorityId && status === 'Assigned to Authority') {
        updateFields.push('assigned_authority_id = ?');
        updateValues.push(assignedAuthorityId);
      }

      updateValues.push(id);

      await connection.execute(
        `UPDATE complaints SET ${updateFields.join(', ')} WHERE id = ?`,
        updateValues
      );

      // Add to status history
      await connection.execute(
        `INSERT INTO complaint_status_history (complaint_id, old_status, new_status, remarks, created_by) 
         VALUES (?, ?, ?, ?, ?)`,
        [id, oldStatus, status, remarks || null, req.user.userId]
      );

      // Create notification for user
      if (status !== oldStatus) {
        // Get complaint details for notification
        const [complaintDetails] = await pool.execute(
          `SELECT c.*, u.name as user_name, u.email as user_email
           FROM complaints c
           LEFT JOIN users u ON c.user_id = u.id
           WHERE c.id = ?`,
          [id]
        );

        if (complaintDetails.length > 0) {
          await notificationService.notifyStatusChange(
            complaintDetails[0], 
            oldStatus, 
            status, 
            remarks || null
          );
        }
      }

      // If escalated, add to escalation log
      if (status === 'Escalated') {
        await escalationService.manualEscalation(id, assignedAuthorityId || null, remarks || 'Escalated by admin', req.user.userId);
      }

      await connection.commit();

      res.json({
        success: true,
        message: 'Complaint status updated successfully'
      });

    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }

  } catch (error) {
    console.error('Update complaint status error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update complaint status'
    });
  }
});

// Get authorities
router.get('/authorities', authenticateAdmin, async (req, res) => {
  try {
    const [authorities] = await pool.execute(
      'SELECT * FROM authorities WHERE is_active = TRUE ORDER BY name'
    );

    res.json({
      success: true,
      data: authorities
    });

  } catch (error) {
    console.error('Get authorities error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch authorities'
    });
  }
});

// Get users
router.get('/users', authenticateAdmin, async (req, res) => {
  try {
    const { page = 1, limit = 10, search } = req.query;
    const offset = (page - 1) * limit;

    let whereClause = 'WHERE 1=1';
    const params = [];

    if (search) {
      whereClause += ' AND (name LIKE ? OR email LIKE ? OR phone LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    const [users] = await pool.execute(
      `SELECT u.*, 
         (SELECT COUNT(*) FROM complaints WHERE user_id = u.id) as total_complaints,
         (SELECT COUNT(*) FROM complaints WHERE user_id = u.id AND status = 'Resolved') as resolved_complaints
       FROM users u
       ${whereClause}
       ORDER BY u.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), offset]
    );

    // Get total count
    const [countResult] = await pool.execute(
      `SELECT COUNT(*) as total FROM users u ${whereClause}`,
      params
    );

    const total = countResult[0].total;
    const totalPages = Math.ceil(total / limit);

    res.json({
      success: true,
      data: {
        users,
        pagination: {
          currentPage: parseInt(page),
          totalPages,
          total,
          limit: parseInt(limit)
        }
      }
    });

  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch users'
    });
  }
});

// Block/Unblock user
router.put('/users/:id/status', authenticateAdmin, [
  body('isActive').isBoolean().withMessage('isActive must be boolean')
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

    const { id } = req.params;
    const { isActive } = req.body;

    await pool.execute(
      'UPDATE users SET is_active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [isActive, id]
    );

    res.json({
      success: true,
      message: `User ${isActive ? 'unblocked' : 'blocked'} successfully`
    });

  } catch (error) {
    console.error('Update user status error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update user status'
    });
  }
});

// Get escalation rules
router.get('/escalation-rules', authenticateAdmin, async (req, res) => {
  try {
    const [rules] = await pool.execute(
      `SELECT er.*, a.name as authority_name
       FROM escalation_rules er
       LEFT JOIN authorities a ON er.escalation_authority_id = a.id
       WHERE er.is_active = TRUE
       ORDER BY er.severity`
    );

    res.json({
      success: true,
      data: rules
    });

  } catch (error) {
    console.error('Get escalation rules error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch escalation rules'
    });
  }
});

// Update escalation rules
router.put('/escalation-rules/:id', authenticateAdmin, [
  body('timeLimitHours').isInt({ min: 1 }).withMessage('Time limit must be at least 1 hour'),
  body('authorityId').optional().isInt({ min: 1 }).withMessage('Valid authority ID required')
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

    const { id } = req.params;
    const { timeLimitHours, authorityId } = req.body;

    await pool.execute(
      'UPDATE escalation_rules SET time_limit_hours = ?, escalation_authority_id = ? WHERE id = ?',
      [timeLimitHours, authorityId || null, id]
    );

    res.json({
      success: true,
      message: 'Escalation rule updated successfully'
    });

  } catch (error) {
    console.error('Update escalation rule error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update escalation rule'
    });
  }
});

module.exports = router;
