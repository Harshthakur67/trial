# Samadhan - Citizen Complaint Management System

A comprehensive web-based platform for citizens to register, track, and manage complaints with government authorities. Built with Node.js backend and vanilla JavaScript frontend.

## 🚀 Features

### For Citizens
- **Easy Registration**: Simple signup process with email/phone verification
- **Complaint Registration**: File complaints with categories, severity levels, and evidence
- **Real-time Tracking**: Monitor complaint status with detailed timeline
- **Geo-location Support**: Auto-detect location or manual entry
- **File Upload**: Attach images and videos as evidence
- **Notifications**: Receive email and in-app notifications for status updates
- **User Dashboard**: Manage all complaints from one place

### For Authorities
- **Admin Dashboard**: Comprehensive analytics and reporting
- **Complaint Management**: View, assign, and manage complaints
- **Status Updates**: Track and update complaint progress
- **Escalation System**: Automatic and manual escalation based on SLA
- **User Management**: Manage citizen accounts
- **Performance Analytics**: Track resolution times and SLA compliance

## 🛠️ Tech Stack

### Backend
- **Node.js** - Server runtime
- **Express.js** - Web framework
- **MySQL** - Database
- **JWT** - Authentication
- **Multer** - File uploads
- **Nodemailer** - Email notifications
- **Bcrypt** - Password hashing

### Frontend
- **Vanilla JavaScript** - No framework dependency
- **Tailwind CSS** - Styling
- **Font Awesome** - Icons
- **Responsive Design** - Mobile-first approach

## 📋 Prerequisites

- Node.js (v14 or higher)
- MySQL (v8 or higher)
- npm or yarn

## 🚀 Installation

### 1. Clone the Repository
```bash
git clone <repository-url>
cd samadhan
```

### 2. Backend Setup

```bash
# Navigate to backend directory
cd backend

# Install dependencies
npm install

# Create uploads directory
mkdir uploads

# Configure environment variables
cp .env.example .env
```

### 3. Database Setup

```bash
# Create MySQL database
mysql -u root -p
CREATE DATABASE samadhan;

# Import database schema
mysql -u root -p samadhan < ../database/schema.sql
```

### 4. Environment Configuration

Edit `backend/.env` file:

```env
# Database Configuration
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=samadhan

# JWT Configuration
JWT_SECRET=your-super-secret-jwt-key
JWT_EXPIRES_IN=7d

# Server Configuration
PORT=3000
NODE_ENV=development

# Email Configuration (optional)
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=your-app-password

# Frontend URL
FRONTEND_URL=http://localhost:5500
```

### 5. Start the Backend Server

```bash
# Development mode
npm run dev

# Production mode
npm start
```

The backend server will start on `http://localhost:3000`

### 6. Frontend Setup

```bash
# Navigate to frontend directory
cd ../frontend

# Serve the files (you can use any static server)
# Using Python 3
python -m http.server 5500

# Using Node.js serve
npx serve -s . -l 5500

# Using live-server (for development)
npx live-server --port=5500
```

The frontend will be available at `http://localhost:5500`

## 📁 Project Structure

```
samadhan/
├── backend/
│   ├── config/
│   │   └── database.js          # Database configuration
│   ├── routes/
│   │   ├── auth.js              # Authentication routes
│   │   ├── complaints.js       # Complaint management
│   │   ├── users.js            # User management
│   │   └── admin.js            # Admin functions
│   ├── services/
│   │   ├── escalationService.js # Automatic escalation
│   │   └── notificationService.js # Email notifications
│   ├── uploads/                 # File upload directory
│   ├── .env                    # Environment variables
│   ├── package.json
│   └── server.js               # Main server file
├── frontend/
│   ├── css/
│   │   └── style.css           # Custom styles
│   ├── js/
│   │   └── main.js             # Main JavaScript file
│   ├── admin/                  # Admin pages
│   │   └── dashboard.html
│   ├── index.html              # Landing page
│   ├── login.html             # User login
│   ├── register.html          # User registration
│   ├── dashboard.html         # User dashboard
│   ├── register-complaint.html # Complaint registration
│   ├── track-complaint.html   # Complaint tracking
│   └── profile.html          # User profile
├── database/
│   └── schema.sql             # Database schema
└── README.md
```

## 🔐 Default Admin Accounts

After setting up the database, you can create admin accounts by inserting into the `admin_users` table:

```sql
INSERT INTO admin_users (username, email, password_hash, role, department) VALUES
('admin', 'admin@samadhan.gov', '$2b$12$YourHashedPasswordHere', 'Super Admin', 'IT'),
('water_admin', 'water@samadhan.gov', '$2b$12$YourHashedPasswordHere', 'Department Authority', 'Water Department');
```

## 📊 Database Schema

The system uses 12 main tables:

- **users** - Citizen accounts
- **admin_users** - Admin accounts
- **complaints** - Complaint records
- **categories** - Complaint categories
- **authorities** - Government authorities
- **complaint_status_history** - Status change tracking
- **complaint_media** - File attachments
- **escalation_rules** - SLA configuration
- **escalations** - Escalation records
- **notifications** - User notifications

## 🔄 SLA and Escalation Rules

Default SLA rules are automatically configured:

- **High Severity**: 72 hours (3 days)
- **Medium Severity**: 168 hours (7 days)
- **Low Severity**: 360 hours (15 days)

The system automatically escalates complaints that exceed these time limits.

## 📧 Email Configuration

For email notifications, configure SMTP settings in `.env`:

```env
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=your-app-password
```

For Gmail, use an App Password instead of your regular password.

## 🚀 Deployment

### Backend Deployment

1. Set `NODE_ENV=production` in environment
2. Configure production database
3. Use PM2 for process management:
   ```bash
   npm install -g pm2
   pm2 start server.js --name "samadhan-backend"
   ```

### Frontend Deployment

Deploy the `frontend` directory to any static hosting service:
- Netlify
- Vercel
- AWS S3 + CloudFront
- Apache/Nginx

## 🔧 API Endpoints

### Authentication
- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login
- `POST /api/auth/admin/login` - Admin login
- `POST /api/auth/forgot-password` - Forgot password
- `POST /api/auth/reset-password` - Reset password

### Complaints
- `POST /api/complaints` - Register complaint
- `GET /api/complaints/track/:ucn` - Track complaint
- `GET /api/complaints/my` - User's complaints
- `GET /api/complaints/:id` - Complaint details

### Admin
- `GET /api/admin/dashboard/stats` - Dashboard statistics
- `GET /api/admin/complaints` - All complaints
- `PUT /api/admin/complaints/:id/status` - Update status
- `GET /api/admin/users` - User management

## 🧪 Testing

```bash
# Run backend tests
cd backend
npm test

# Test API endpoints
curl -X GET http://localhost:3000/api/health
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📝 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🆘 Support

For support and questions:
- Create an issue in the repository
- Email: support@samadhan.gov
- Documentation: [Wiki](link-to-wiki)

## 🌟 Acknowledgments

- Government of India for the initiative
- All contributors and developers
- Open source community

---

**Samadhan** - Empowering citizens through transparent complaint resolution 🤝
