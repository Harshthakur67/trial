const nodemailer = require('nodemailer');
const pool = require('../config/database');

class NotificationService {
    constructor() {
        this.transporter = null;
        this.initializeEmailService();
    }

    // Initialize email service
    initializeEmailService() {
        if (process.env.EMAIL_HOST && process.env.EMAIL_USER && process.env.EMAIL_PASS) {
            this.transporter = nodemailer.createTransporter({
                host: process.env.EMAIL_HOST,
                port: process.env.EMAIL_PORT || 587,
                secure: false,
                auth: {
                    user: process.env.EMAIL_USER,
                    pass: process.env.EMAIL_PASS
                }
            });

            // Verify connection
            this.transporter.verify((error, success) => {
                if (error) {
                    console.log('❌ Email service not available:', error.message);
                    this.transporter = null;
                } else {
                    console.log('✅ Email service ready');
                }
            });
        } else {
            console.log('⚠️ Email service not configured');
        }
    }

    // Send email notification
    async sendEmail(to, subject, text, html = null) {
        if (!this.transporter) {
            console.log('📧 Email service not available, skipping email to:', to);
            return false;
        }

        try {
            const mailOptions = {
                from: process.env.EMAIL_USER,
                to: to,
                subject: subject,
                text: text,
                html: html || this.generateEmailHTML(subject, text)
            };

            const result = await this.transporter.sendMail(mailOptions);
            console.log('📧 Email sent successfully to:', to);
            return true;

        } catch (error) {
            console.error('❌ Failed to send email to', to, ':', error);
            return false;
        }
    }

    // Generate HTML email template
    generateEmailHTML(subject, message) {
        return `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="utf-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>${subject}</title>
                <style>
                    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                    .header { background: #2563eb; color: white; padding: 20px; text-align: center; }
                    .content { padding: 20px; background: #f9fafb; }
                    .footer { background: #1f2937; color: white; padding: 20px; text-align: center; font-size: 12px; }
                    .btn { display: inline-block; padding: 10px 20px; background: #2563eb; color: white; text-decoration: none; border-radius: 5px; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1>🤝 Samadhan</h1>
                        <p>Citizen Complaint Management System</p>
                    </div>
                    <div class="content">
                        <h2>${subject}</h2>
                        <p>${message}</p>
                        <p style="margin-top: 30px;">
                            <a href="${process.env.FRONTEND_URL || 'http://localhost:5500'}" class="btn">Visit Samadhan Portal</a>
                        </p>
                    </div>
                    <div class="footer">
                        <p>&copy; 2024 Samadhan. Government of India</p>
                        <p>This is an automated message. Please do not reply to this email.</p>
                    </div>
                </div>
            </body>
            </html>
        `;
    }

    // Create notification in database
    async createNotification(userId, complaintId, title, message, type) {
        try {
            const [result] = await pool.execute(
                `INSERT INTO notifications (user_id, complaint_id, title, message, type) 
                 VALUES (?, ?, ?, ?, ?)`,
                [userId, complaintId, title, message, type]
            );

            console.log(`📝 Notification created for user ${userId}: ${title}`);
            return result.insertId;

        } catch (error) {
            console.error('❌ Failed to create notification:', error);
            throw error;
        }
    }

    // Send complaint submission notification
    async notifyComplaintSubmission(complaint) {
        try {
            const title = 'Complaint Registered Successfully';
            const message = `Your complaint ${complaint.ucn} has been registered successfully. We will review it shortly.`;

            // Create database notification
            await this.createNotification(
                complaint.user_id,
                complaint.id,
                title,
                message,
                'submission'
            );

            // Send email if user email is available
            if (complaint.user_email) {
                const emailSubject = `Samadhan - Complaint ${complaint.ucn} Registered`;
                const emailMessage = `
Dear ${complaint.user_name},

Thank you for registering your complaint with Samadhan.

Complaint Details:
- Complaint Number: ${complaint.ucn}
- Title: ${complaint.title}
- Category: ${complaint.category_name}
- Severity: ${complaint.severity}

You can track the status of your complaint using the complaint number on our portal.

Thank you for helping us improve our services.

Best regards,
Samadhan Team
                `;

                await this.sendEmail(complaint.user_email, emailSubject, emailMessage);
            }

        } catch (error) {
            console.error('❌ Failed to send complaint submission notification:', error);
        }
    }

    // Send status change notification
    async notifyStatusChange(complaint, oldStatus, newStatus, remarks = null) {
        try {
            const title = 'Complaint Status Updated';
            const message = `Your complaint ${complaint.ucn} status has been updated from "${oldStatus}" to "${newStatus}".${remarks ? ` Remarks: ${remarks}` : ''}`;

            // Create database notification
            await this.createNotification(
                complaint.user_id,
                complaint.id,
                title,
                message,
                'status_change'
            );

            // Send email if user email is available
            if (complaint.user_email) {
                const emailSubject = `Samadhan - Complaint ${complaint.ucn} Status Updated`;
                const emailMessage = `
Dear ${complaint.user_name},

Your complaint status has been updated.

Complaint Details:
- Complaint Number: ${complaint.ucn}
- Previous Status: ${oldStatus}
- New Status: ${newStatus}
${remarks ? `- Remarks: ${remarks}` : ''}

You can track the complete status history on our portal.

Best regards,
Samadhan Team
                `;

                await this.sendEmail(complaint.user_email, emailSubject, emailMessage);
            }

        } catch (error) {
            console.error('❌ Failed to send status change notification:', error);
        }
    }

    // Send escalation notification
    async notifyEscalation(complaint, reason) {
        try {
            const title = 'Complaint Escalated';
            const message = `Your complaint ${complaint.ucn} has been escalated to a higher authority. Reason: ${reason}`;

            // Create database notification
            await this.createNotification(
                complaint.user_id,
                complaint.id,
                title,
                message,
                'escalation'
            );

            // Send email if user email is available
            if (complaint.user_email) {
                const emailSubject = `Samadhan - Complaint ${complaint.ucn} Escalated`;
                const emailMessage = `
Dear ${complaint.user_name},

Your complaint has been escalated to ensure timely resolution.

Complaint Details:
- Complaint Number: ${complaint.ucn}
- Escalation Reason: ${reason}

We apologize for the delay and assure you that your complaint is receiving priority attention.

Best regards,
Samadhan Team
                `;

                await this.sendEmail(complaint.user_email, emailSubject, emailMessage);
            }

        } catch (error) {
            console.error('❌ Failed to send escalation notification:', error);
        }
    }

    // Send resolution notification
    async notifyResolution(complaint, resolutionRemarks = null) {
        try {
            const title = 'Complaint Resolved';
            const message = `Your complaint ${complaint.ucn} has been resolved.${resolutionRemarks ? ` Resolution remarks: ${resolutionRemarks}` : ''}`;

            // Create database notification
            await this.createNotification(
                complaint.user_id,
                complaint.id,
                title,
                message,
                'resolution'
            );

            // Send email if user email is available
            if (complaint.user_email) {
                const emailSubject = `Samadhan - Complaint ${complaint.ucn} Resolved`;
                const emailMessage = `
Dear ${complaint.user_name},

Good news! Your complaint has been resolved.

Complaint Details:
- Complaint Number: ${complaint.ucn}
- Resolution Date: ${new Date().toLocaleDateString('en-IN')}
${resolutionRemarks ? `- Resolution Details: ${resolutionRemarks}` : ''}

Thank you for your patience. If you have any feedback about the resolution process, please let us know.

Best regards,
Samadhan Team
                `;

                await this.sendEmail(complaint.user_email, emailSubject, emailMessage);
            }

        } catch (error) {
            console.error('❌ Failed to send resolution notification:', error);
        }
    }

    // Send bulk notifications (for system announcements)
    async sendBulkNotification(title, message, type = 'system') {
        try {
            // Get all active users
            const [users] = await pool.execute(
                'SELECT id, email, name FROM users WHERE is_active = TRUE'
            );

            let emailSent = 0;
            let dbNotifications = 0;

            for (const user of users) {
                try {
                    // Create database notification
                    await this.createNotification(user.id, null, title, message, type);
                    dbNotifications++;

                    // Send email
                    if (user.email) {
                        const emailSubject = `Samadhan - ${title}`;
                        const emailMessage = `
Dear ${user.name},

${message}

Please visit our portal for more information.

Best regards,
Samadhan Team
                        `;

                        const sent = await this.sendEmail(user.email, emailSubject, emailMessage);
                        if (sent) emailSent++;
                    }
                } catch (error) {
                    console.error(`Failed to send notification to user ${user.id}:`, error);
                }
            }

            console.log(`📊 Bulk notification sent: ${dbNotifications} DB notifications, ${emailSent} emails`);

        } catch (error) {
            console.error('❌ Failed to send bulk notification:', error);
        }
    }

    // Get notification statistics
    async getNotificationStats() {
        try {
            const [stats] = await pool.execute(`
                SELECT 
                    COUNT(*) as total_notifications,
                    COUNT(CASE WHEN is_read = FALSE THEN 1 END) as unread_notifications,
                    COUNT(CASE WHEN created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR) THEN 1 END) as last_24h,
                    COUNT(CASE WHEN created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) THEN 1 END) as last_7d
                FROM notifications
            `);

            const [byType] = await pool.execute(`
                SELECT type, COUNT(*) as count
                FROM notifications
                GROUP BY type
            `);

            return {
                success: true,
                data: {
                    ...stats[0],
                    byType
                }
            };

        } catch (error) {
            console.error('❌ Failed to get notification stats:', error);
            throw error;
        }
    }

    // Clean old notifications (older than 90 days)
    async cleanupOldNotifications() {
        try {
            const [result] = await pool.execute(
                'DELETE FROM notifications WHERE created_at < DATE_SUB(NOW(), INTERVAL 90 DAY)'
            );

            if (result.affectedRows > 0) {
                console.log(`🧹 Cleaned up ${result.affectedRows} old notifications`);
            }

        } catch (error) {
            console.error('❌ Failed to cleanup old notifications:', error);
        }
    }
}

module.exports = new NotificationService();
