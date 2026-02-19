// Main JavaScript for Samadhan Frontend

// Mobile menu toggle
document.addEventListener('DOMContentLoaded', function() {
    const mobileMenuButton = document.getElementById('mobile-menu-button');
    const mobileMenu = document.getElementById('mobile-menu');
    
    if (mobileMenuButton && mobileMenu) {
        mobileMenuButton.addEventListener('click', function() {
            mobileMenu.classList.toggle('hidden');
        });
    }
    
    // Close mobile menu when clicking on links
    const mobileLinks = mobileMenu?.querySelectorAll('a');
    mobileLinks?.forEach(link => {
        link.addEventListener('click', function() {
            mobileMenu.classList.add('hidden');
        });
    });
});

// FAQ toggle function
function toggleFAQ(element) {
    const answer = element.nextElementSibling;
    const icon = element.querySelector('i');
    
    answer.classList.toggle('hidden');
    icon.classList.toggle('fa-chevron-down');
    icon.classList.toggle('fa-chevron-up');
}

// Smooth scroll for navigation links
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        e.preventDefault();
        const target = document.querySelector(this.getAttribute('href'));
        if (target) {
            target.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });
        }
    });
});

// Form validation utilities
const FormValidator = {
    validateEmail: function(email) {
        const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return re.test(email);
    },
    
    validatePhone: function(phone) {
        const re = /^[6-9]\d{9}$/;
        return re.test(phone.replace(/\s/g, ''));
    },
    
    validatePassword: function(password) {
        return password.length >= 6;
    },
    
    showError: function(inputId, message) {
        const input = document.getElementById(inputId);
        const errorDiv = document.getElementById(inputId + '-error');
        
        if (input) {
            input.classList.add('error');
        }
        
        if (errorDiv) {
            errorDiv.textContent = message;
            errorDiv.style.display = 'block';
        }
    },
    
    clearError: function(inputId) {
        const input = document.getElementById(inputId);
        const errorDiv = document.getElementById(inputId + '-error');
        
        if (input) {
            input.classList.remove('error');
        }
        
        if (errorDiv) {
            errorDiv.textContent = '';
            errorDiv.style.display = 'none';
        }
    },
    
    clearAllErrors: function() {
        document.querySelectorAll('.error').forEach(input => {
            input.classList.remove('error');
        });
        document.querySelectorAll('[id$="-error"]').forEach(errorDiv => {
            errorDiv.textContent = '';
            errorDiv.style.display = 'none';
        });
    }
};

// API utilities
const API = {
    baseURL: 'http://localhost:3000/api',
    
    request: async function(endpoint, options = {}) {
        const url = `${this.baseURL}${endpoint}`;
        const defaultOptions = {
            headers: {
                'Content-Type': 'application/json',
            },
        };
        
        // Add auth token if available
        const token = localStorage.getItem('samadhan_token');
        if (token) {
            defaultOptions.headers.Authorization = `Bearer ${token}`;
        }
        
        const finalOptions = {
            ...defaultOptions,
            ...options,
            headers: {
                ...defaultOptions.headers,
                ...options.headers,
            },
        };
        
        try {
            const response = await fetch(url, finalOptions);
            const data = await response.json();
            
            if (!response.ok) {
                throw new Error(data.message || 'Something went wrong');
            }
            
            return data;
        } catch (error) {
            console.error('API Error:', error);
            throw error;
        }
    },
    
    get: function(endpoint) {
        return this.request(endpoint, { method: 'GET' });
    },
    
    post: function(endpoint, data) {
        return this.request(endpoint, {
            method: 'POST',
            body: JSON.stringify(data),
        });
    },
    
    put: function(endpoint, data) {
        return this.request(endpoint, {
            method: 'PUT',
            body: JSON.stringify(data),
        });
    },
    
    delete: function(endpoint) {
        return this.request(endpoint, { method: 'DELETE' });
    }
};

// Authentication utilities
const Auth = {
    isLoggedIn: function() {
        return !!localStorage.getItem('samadhan_token');
    },
    
    getUser: function() {
        const user = localStorage.getItem('samadhan_user');
        return user ? JSON.parse(user) : null;
    },
    
    logout: function() {
        localStorage.removeItem('samadhan_token');
        localStorage.removeItem('samadhan_user');
        window.location.href = 'login.html';
    },
    
    login: function(token, user) {
        localStorage.setItem('samadhan_token', token);
        localStorage.setItem('samadhan_user', JSON.stringify(user));
    }
};

// Notification utilities
const Notification = {
    show: function(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `fixed top-4 right-4 p-4 rounded-lg shadow-lg z-50 max-w-sm ${
            type === 'success' ? 'bg-green-500 text-white' :
            type === 'error' ? 'bg-red-500 text-white' :
            type === 'warning' ? 'bg-yellow-500 text-white' :
            'bg-blue-500 text-white'
        }`;
        notification.innerHTML = `
            <div class="flex items-center">
                <i class="fas ${
                    type === 'success' ? 'fa-check-circle' :
                    type === 'error' ? 'fa-exclamation-circle' :
                    type === 'warning' ? 'fa-exclamation-triangle' :
                    'fa-info-circle'
                } mr-2"></i>
                <span>${message}</span>
            </div>
        `;
        
        document.body.appendChild(notification);
        
        // Auto remove after 5 seconds
        setTimeout(() => {
            notification.remove();
        }, 5000);
        
        // Remove on click
        notification.addEventListener('click', () => {
            notification.remove();
        });
    },
    
    success: function(message) {
        this.show(message, 'success');
    },
    
    error: function(message) {
        this.show(message, 'error');
    },
    
    warning: function(message) {
        this.show(message, 'warning');
    },
    
    info: function(message) {
        this.show(message, 'info');
    }
};

// Date formatting utilities
const DateUtils = {
    format: function(dateString) {
        const date = new Date(dateString);
        return date.toLocaleDateString('en-IN', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    },
    
    formatShort: function(dateString) {
        const date = new Date(dateString);
        return date.toLocaleDateString('en-IN', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
    },
    
    getTimeAgo: function(dateString) {
        const date = new Date(dateString);
        const now = new Date();
        const diff = now - date;
        
        const minutes = Math.floor(diff / 60000);
        const hours = Math.floor(diff / 3600000);
        const days = Math.floor(diff / 86400000);
        
        if (minutes < 60) {
            return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
        } else if (hours < 24) {
            return `${hours} hour${hours > 1 ? 's' : ''} ago`;
        } else if (days < 30) {
            return `${days} day${days > 1 ? 's' : ''} ago`;
        } else {
            return this.formatShort(dateString);
        }
    }
};

// File upload utilities
const FileUpload = {
    validateImage: function(file) {
        const validTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
        const maxSize = 5 * 1024 * 1024; // 5MB
        
        if (!validTypes.includes(file.type)) {
            throw new Error('Only JPEG, PNG, GIF, and WebP images are allowed');
        }
        
        if (file.size > maxSize) {
            throw new Error('File size must be less than 5MB');
        }
        
        return true;
    },
    
    validateVideo: function(file) {
        const validTypes = ['video/mp4', 'video/webm', 'video/ogg'];
        const maxSize = 50 * 1024 * 1024; // 50MB
        
        if (!validTypes.includes(file.type)) {
            throw new Error('Only MP4, WebM, and OGG videos are allowed');
        }
        
        if (file.size > maxSize) {
            throw new Error('File size must be less than 50MB');
        }
        
        return true;
    },
    
    previewImage: function(file, callback) {
        const reader = new FileReader();
        reader.onload = function(e) {
            callback(e.target.result);
        };
        reader.readAsDataURL(file);
    }
};

// Loading utilities
const Loading = {
    show: function(elementId) {
        const element = document.getElementById(elementId);
        if (element) {
            element.innerHTML = '<div class="spinner mx-auto"></div>';
            element.disabled = true;
        }
    },
    
    hide: function(elementId, originalContent) {
        const element = document.getElementById(elementId);
        if (element) {
            element.innerHTML = originalContent;
            element.disabled = false;
        }
    }
};

// Geolocation utilities
const GeoLocation = {
    getCurrentPosition: function() {
        return new Promise((resolve, reject) => {
            if (!navigator.geolocation) {
                reject(new Error('Geolocation is not supported by your browser'));
                return;
            }
            
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    resolve({
                        latitude: position.coords.latitude,
                        longitude: position.coords.longitude
                    });
                },
                (error) => {
                    reject(new Error('Unable to retrieve your location'));
                },
                {
                    enableHighAccuracy: true,
                    timeout: 10000,
                    maximumAge: 0
                }
            );
        });
    }
};

// Export utilities for use in other scripts
window.Samadhan = {
    FormValidator,
    API,
    Auth,
    Notification,
    DateUtils,
    FileUpload,
    Loading,
    GeoLocation
};
