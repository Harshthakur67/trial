const pool = require('../config/database');
const moment = require('moment');

class EscalationService {
    constructor() {
        this.isRunning = false;
        this.interval = null;
    }

    // Start the escalation service
    start() {
        if (this.isRunning) {
            console.log('Escalation service is already running');
            return;
        }

        this.isRunning = true;
        console.log('🚀 Starting escalation service...');

        // Run every hour
        this.interval = setInterval(async () => {
            try {
                await this.checkAndEscalateComplaints();
            } catch (error) {
                console.error('Error in escalation service:', error);
            }
        }, 60 * 60 * 1000); // 1 hour

        // Run once immediately on start
        this.checkAndEscalateComplaints();
    }

    // Stop the escalation service
    stop() {
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = null;
        }
        this.isRunning = false;
        console.log('⏹️ Escalation service stopped');
    }

    // Check and escalate complaints that exceed SLA
    async checkAndEscalateComplaints() {
        console.log('🔍 Checking for complaints that need escalation...');
        
        try {
            // Get escalation rules
            const [rules] = await pool.execute(
                'SELECT * FROM escalation_rules WHERE is_active = TRUE'
            );

            if (rules.length === 0) {
                console.log('⚠️ No escalation rules found');
                return;
            }

            // Get complaints that need escalation
            const [complaintsToCheck] = await pool.execute(`
                SELECT c.*, cat.name as category_name, u.name as user_name, u.email as user_email,
                       a.name as current_authority, a.id as current_authority_id
                FROM complaints c
                LEFT JOIN categories cat ON c.category_id = cat.id
                LEFT JOIN users u ON c.user_id = u.id
                LEFT JOIN authorities a ON c.assigned_authority_id = a.id
                WHERE c.status NOT IN ('Resolved', 'Escalated')
                AND c.created_at < DATE_SUB(NOW(), INTERVAL 1 HOUR)
            `);

            let escalatedCount = 0;

            for (const complaint of complaintsToCheck) {
                const rule = rules.find(r => r.severity === complaint.severity);
                if (!rule) continue;

                const timeLimitHours = rule.time_limit_hours;
                const complaintAge = moment().diff(moment(complaint.created_at), 'hours');

                if (complaintAge >= timeLimitHours) {
                    await this.escalateComplaint(complaint, rule);
                    escalatedCount++;
                }
            }

            if (escalatedCount > 0) {
                console.log(`✅ Escalated ${escalatedCount} complaints`);
            } else {
                console.log('ℹ️ No complaints required escalation');
            }

        } catch (error) {
            console.error('❌ Error checking escalations:', error);
        }
    }

    // Escalate a specific complaint
    async escalateComplaint(complaint, rule) {
        const connection = await pool.getConnection();
        
        try {
            await connection.beginTransaction();

            // Get escalation authority
            let escalationAuthorityId = rule.escalation_authority_id;
            
            // If no specific authority, get a higher level authority
            if (!escalationAuthorityId) {
                const [higherAuthorities] = await connection.execute(
                    'SELECT id FROM authorities WHERE id != ? AND is_active = TRUE ORDER BY RAND() LIMIT 1',
                    [complaint.assigned_authority_id || 0]
                );
                
                if (higherAuthorities.length > 0) {
                    escalationAuthorityId = higherAuthorities[0].id;
                }
            }

            // Update complaint status
            await connection.execute(
                `UPDATE complaints 
                 SET status = 'Escalated', 
                     assigned_authority_id = ?, 
                     updated_at = CURRENT_TIMESTAMP 
                 WHERE id = ?`,
                [escalationAuthorityId, complaint.id]
            );

            // Add to status history
            await connection.execute(
                `INSERT INTO complaint_status_history 
                 (complaint_id, old_status, new_status, remarks, created_by) 
                 VALUES (?, ?, 'Escalated', ?, NULL)`,
                [complaint.id, complaint.status, `Automatically escalated due to SLA breach (${rule.time_limit_hours} hours limit exceeded)`]
            );

            // Add to escalation log
            await connection.execute(
                `INSERT INTO escalations 
                 (complaint_id, from_authority_id, to_authority_id, reason) 
                 VALUES (?, ?, ?, ?)`,
                [complaint.id, complaint.assigned_authority_id, escalationAuthorityId, 
                 `SLA breach: ${rule.time_limit_hours} hours limit exceeded`]
            );

            // Create notification for user
            await connection.execute(
                `INSERT INTO notifications 
                 (user_id, complaint_id, title, message, type) 
                 VALUES (?, ?, ?, ?, 'escalation')`,
                [complaint.user_id, complaint.id, 'Complaint Escalated', 
                 `Your complaint ${complaint.ucn} has been escalated due to delay in resolution`, 'escalation']
            );

            // Get escalation authority details for notification
            const [escalationAuthority] = await connection.execute(
                'SELECT name, email FROM authorities WHERE id = ?',
                [escalationAuthorityId]
            );

            if (escalationAuthority.length > 0) {
                // Create notification for new authority (if we had admin users table)
                console.log(`📧 Escalated complaint ${complaint.ucn} to ${escalationAuthority[0].name}`);
            }

            await connection.commit();

            console.log(`🔝 Escalated complaint ${complaint.ucn} (Severity: ${complaint.severity}, Age: ${moment().diff(moment(complaint.created_at), 'hours')}h)`);

        } catch (error) {
            await connection.rollback();
            console.error(`❌ Failed to escalate complaint ${complaint.ucn}:`, error);
            throw error;
        } finally {
            connection.release();
        }
    }

    // Manual escalation by admin
    async manualEscalation(complaintId, newAuthorityId, reason, adminId) {
        const connection = await pool.getConnection();
        
        try {
            await connection.beginTransaction();

            // Get current complaint details
            const [complaints] = await connection.execute(
                'SELECT * FROM complaints WHERE id = ?',
                [complaintId]
            );

            if (complaints.length === 0) {
                throw new Error('Complaint not found');
            }

            const complaint = complaints[0];

            // Update complaint
            await connection.execute(
                `UPDATE complaints 
                 SET status = 'Escalated', 
                     assigned_authority_id = ?, 
                     updated_at = CURRENT_TIMESTAMP 
                 WHERE id = ?`,
                [newAuthorityId, complaintId]
            );

            // Add to status history
            await connection.execute(
                `INSERT INTO complaint_status_history 
                 (complaint_id, old_status, new_status, remarks, created_by) 
                 VALUES (?, ?, 'Escalated', ?, ?)`,
                [complaintId, complaint.status, reason || 'Manually escalated by admin', adminId]
            );

            // Add to escalation log
            await connection.execute(
                `INSERT INTO escalations 
                 (complaint_id, from_authority_id, to_authority_id, reason) 
                 VALUES (?, ?, ?, ?)`,
                [complaintId, complaint.assigned_authority_id, newAuthorityId, reason || 'Manual escalation']
            );

            // Create notification for user
            await connection.execute(
                `INSERT INTO notifications 
                 (user_id, complaint_id, title, message, type) 
                 VALUES (?, ?, ?, ?, 'escalation')`,
                [complaint.user_id, complaintId, 'Complaint Escalated', 
                 `Your complaint ${complaint.ucn} has been escalated: ${reason || 'Manual escalation by admin'}`, 'escalation']
            );

            await connection.commit();

            return {
                success: true,
                message: 'Complaint escalated successfully'
            };

        } catch (error) {
            await connection.rollback();
            console.error('Manual escalation failed:', error);
            throw error;
        } finally {
            connection.release();
        }
    }

    // Get escalation statistics
    async getEscalationStats() {
        try {
            const [stats] = await pool.execute(`
                SELECT 
                    COUNT(*) as total_escalations,
                    COUNT(CASE WHEN DATE(escalated_at) = CURDATE() THEN 1 END) as today_escalations,
                    COUNT(CASE WHEN DATE(escalated_at) >= DATE_SUB(CURDATE(), INTERVAL 7 DAY) THEN 1 END) as week_escalations,
                    COUNT(CASE WHEN DATE(escalated_at) >= DATE_SUB(CURDATE(), INTERVAL 30 DAY) THEN 1 END) as month_escalations
                FROM escalations
            `);

            const [bySeverity] = await pool.execute(`
                SELECT c.severity, COUNT(e.id) as escalation_count
                FROM escalations e
                JOIN complaints c ON e.complaint_id = c.id
                GROUP BY c.severity
            `);

            const [byCategory] = await pool.execute(`
                SELECT cat.name, COUNT(e.id) as escalation_count
                FROM escalations e
                JOIN complaints c ON e.complaint_id = c.id
                JOIN categories cat ON c.category_id = cat.id
                GROUP BY cat.id, cat.name
                ORDER BY escalation_count DESC
                LIMIT 10
            `);

            return {
                success: true,
                data: {
                    ...stats[0],
                    bySeverity,
                    byCategory
                }
            };

        } catch (error) {
            console.error('Failed to get escalation stats:', error);
            throw error;
        }
    }

    // Get SLA compliance report
    async getSLAComplianceReport() {
        try {
            const [compliance] = await pool.execute(`
                SELECT 
                    c.severity,
                    er.time_limit_hours,
                    COUNT(*) as total_complaints,
                    COUNT(CASE WHEN c.status = 'Resolved' THEN 1 END) as resolved_complaints,
                    COUNT(CASE WHEN c.status = 'Escalated' THEN 1 END) as escalated_complaints,
                    AVG(CASE 
                        WHEN c.status = 'Resolved' 
                        THEN TIMESTAMPDIFF(HOUR, c.created_at, c.updated_at)
                        ELSE NULL 
                    END) as avg_resolution_hours,
                    MAX(CASE 
                        WHEN c.status = 'Resolved' 
                        THEN TIMESTAMPDIFF(HOUR, c.created_at, c.updated_at)
                        ELSE NULL 
                    END) as max_resolution_hours
                FROM complaints c
                LEFT JOIN escalation_rules er ON c.severity = er.severity
                WHERE c.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
                GROUP BY c.severity, er.time_limit_hours
            `);

            return {
                success: true,
                data: compliance
            };

        } catch (error) {
            console.error('Failed to get SLA compliance report:', error);
            throw error;
        }
    }
}

module.exports = new EscalationService();
