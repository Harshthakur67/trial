#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('🚀 Setting up Samadhan Complaint Management System...\n');

// Check if Node.js is installed
try {
  const nodeVersion = execSync('node --version', { encoding: 'utf8' });
  console.log(`✅ Node.js ${nodeVersion.trim()} found`);
} catch (error) {
  console.error('❌ Node.js is not installed. Please install Node.js v14 or higher.');
  process.exit(1);
}

// Check if MySQL is installed
try {
  execSync('mysql --version', { encoding: 'utf8' });
  console.log('✅ MySQL found');
} catch (error) {
  console.error('❌ MySQL is not installed. Please install MySQL v8 or higher.');
  process.exit(1);
}

// Create necessary directories
const directories = [
  'backend/uploads',
  'logs'
];

directories.forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    console.log(`📁 Created directory: ${dir}`);
  }
});

// Copy environment file template
const envTemplate = `# Database Configuration
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=
DB_NAME=samadhan

# JWT Configuration
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
JWT_EXPIRES_IN=7d

# Server Configuration
PORT=3000
NODE_ENV=development

# File Upload Configuration
UPLOAD_PATH=./uploads
MAX_FILE_SIZE=10485760

# Email Configuration (for notifications)
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=your-app-password

# Frontend URL
FRONTEND_URL=http://localhost:5500
`;

const envPath = path.join(__dirname, 'backend', '.env');
if (!fs.existsSync(envPath)) {
  fs.writeFileSync(envPath, envTemplate);
  console.log('📝 Created .env file in backend directory');
  console.log('⚠️  Please update the .env file with your database credentials');
} else {
  console.log('📝 .env file already exists');
}

console.log('\n🎉 Setup completed successfully!');
console.log('\n📋 Next steps:');
console.log('1. Update backend/.env with your database credentials');
console.log('2. Create MySQL database: mysql -u root -p -e "CREATE DATABASE samadhan;"');
console.log('3. Import schema: mysql -u root -p samadhan < database/schema.sql');
console.log('4. Install backend dependencies: cd backend && npm install');
console.log('5. Start backend server: npm start');
console.log('6. Serve frontend files from frontend directory');
console.log('\n🌐 Access the application at:');
console.log('   Frontend: http://localhost:5500');
console.log('   Backend API: http://localhost:3000');
console.log('   Health Check: http://localhost:3000/api/health');
