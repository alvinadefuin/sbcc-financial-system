# SBCC Financial Management System

A comprehensive church financial management application with Google Forms integration and OAuth authentication.

## 🚀 **System Status: Production Ready**

### **Live Applications**
- **Production Backend**: https://sbcc-financial-system-production.up.railway.app
- **Production Frontend**: https://sbcc-financial-system.vercel.app
- **Local Development**: http://localhost:3000

## 📋 **Features**

### **Financial Management**
- ✅ **Collections Tracking**: Tithes, offerings, and special funds
- ✅ **Expense Management**: Categorized church expenses
- ✅ **Budget Planning**: Annual budget management
- ✅ **Financial Reports**: Monthly and yearly analytics
- ✅ **Google Forms Integration**: Direct data submission from forms
- ✅ **Google Forms Management**: Admin interface for sharing form links
- ✅ **Dynamic Expense Categories**: Multi-entry operational fund tracking

### **Authentication & Security**
- ✅ **Google OAuth**: Sign in with Google accounts
- ✅ **JWT Authentication**: Secure token-based authentication
- ✅ **Role-Based Access**: Admin, user, and super admin roles
- ✅ **CORS Security**: Configured for production deployment

### **Database & Deployment**
- ✅ **Development**: SQLite for local development
- ✅ **Production**: PostgreSQL (Supabase) for production
- ✅ **Cloud Deployment**: Backend on Railway, Frontend on Vercel
- ✅ **Environment Management**: Secure credential handling

## 🛠 **Technology Stack**

### **Backend**
- **Runtime**: Node.js with Express.js
- **Database**: SQLite (dev) / PostgreSQL (prod)
- **Authentication**: JWT + Google OAuth 2.0
- **Deployment**: Railway

### **Frontend**
- **Framework**: React.js with Tailwind CSS
- **Charts**: Recharts for data visualization
- **Authentication**: Google Sign-In integration
- **Deployment**: Vercel

### **Integrations**
- **Google Forms**: Direct submission to API
- **Google OAuth**: Secure user authentication
- **Supabase**: PostgreSQL database hosting

## 🚀 **Quick Start**

### **Development Setup**

1. **Clone Repository**
   ```bash
   git clone https://github.com/alvinadefuin/sbcc-financial-system.git
   cd sbcc-financial-system
   ```

2. **Backend Setup**
   ```bash
   cd backend
   npm install
   
   # Copy and configure environment variables
   cp .env.development .env.development.local
   # Edit .env.development.local with your Google OAuth credentials
   
   npm run dev  # Runs on http://localhost:3001
   ```

3. **Frontend Setup**
   ```bash
   cd frontend
   npm install
   npm start    # Runs on http://localhost:3000
   ```

4. **Default Login**
   - Email: `admin@sbcc.church`
   - Password: `admin123`

### **Google OAuth Setup**

1. **Google Cloud Console**
   - Create OAuth 2.0 credentials
   - Add authorized origins: `http://localhost:3000` (dev), your production URL
   - Enable Google People API

2. **Environment Variables**
   ```bash
   # .env.development.local
   GOOGLE_CLIENT_ID=your-client-id.googleusercontent.com
   GOOGLE_CLIENT_SECRET=your-client-secret
   ```

3. **Production Deployment**
   - Update Railway environment variables
   - Update Google OAuth authorized origins with production URLs

## 📂 **Project Structure**

```
sbcc-financial-system/
├── backend/                 # Node.js/Express API
│   ├── routes/             # API endpoints
│   ├── config/             # Database configuration
│   ├── services/           # Business logic
│   └── .env.development    # Environment template
├── frontend/               # React application
│   ├── src/components/     # React components
│   ├── src/utils/         # API services
│   └── public/            # Static assets
├── database/              # SQLite files (development)
└── CLAUDE.md             # Development instructions
```

## 🔧 **API Endpoints**

### **Authentication**
- `POST /api/auth/login` - Regular login
- `POST /api/auth/google` - Google OAuth login
- `GET /api/auth/google/config` - Get OAuth configuration
- `GET /api/auth/me` - Get current user

### **Financial Data**
- `GET/POST /api/collections` - Church collections
- `GET/POST /api/expenses` - Church expenses
- `GET/POST /api/budget` - Budget management

### **Google Forms Integration**
- `POST /api/forms/collection` - Submit collection data
- `POST /api/forms/expense` - Submit expense data
- `GET /api/forms/validate-user/:email` - Validate form submitter

### **User Management**
- `GET /api/auth/users` - List users (admin only)
- `POST /api/auth/users` - Create user (admin only)
- `PUT /api/auth/users/:id` - Update user (admin only)

## 📝 **Google Forms Integration**

The system includes a comprehensive Google Forms integration that allows church members to submit financial data directly through Google Forms, which automatically sync with the financial management system.

### **Features**
- ✅ **Admin Interface**: Dedicated Google Forms management page in admin panel
- ✅ **Pre-configured Forms**: Collection and Expense forms ready to use
- ✅ **Copy Link Functionality**: One-click copy of form URLs to clipboard
- ✅ **Direct Form Access**: Open forms in new tab for preview/testing
- ✅ **User Validation**: Only authorized users can submit data
- ✅ **Dynamic Expense Fields**: Support for multiple operational fund categories
- ✅ **Auto-calculation**: Automatic totaling of form submissions
- ✅ **Professional UI**: Clean, responsive interface with clear instructions

### **Form Types**

#### **Collection Form**
- **Purpose**: Recording church income (tithes, offerings, special funds)
- **Fields**: General Tithes/Offering, Sunday School, Young People, Sisterhood funds, Brotherhood, Bank Interest
- **Auto-calculation**: Automatically calculates total amount
- **Integration**: Direct submission to `/api/forms/collection`

#### **Expense Form** 
- **Purpose**: Recording church expenses and operational costs
- **Fields**: 
  - PBCM Share/PDOT
  - Pastoral Team
  - Dynamic Operational Fund Categories (with Add/Remove functionality)
- **Features**: 
  - Add multiple operational fund entries
  - Category selection from predefined list
  - Individual amount tracking per category
- **Integration**: Direct submission to `/api/forms/expense`

### **Admin Usage**
1. **Access**: Navigate to "Google Forms" in the admin sidebar
2. **Copy Links**: Use "Copy Link" button to copy form URLs
3. **Preview Forms**: Use "Open Form" button to test forms
4. **Share Manually**: Share copied links via email, messaging, or other channels

### **Form URLs**
- **Collection**: `https://docs.google.com/forms/d/e/1FAIpQLSd1i2QigWXVj-yV_d-HP83gJFVUscFdivGSBIxPShwU9Era5Q/viewform`
- **Expense**: `https://docs.google.com/forms/d/e/1FAIpQLSdGuAwkAARryQ1jGZ-BQoKXZH3YMBBwzzrqimxmJECCDIvMRw/viewform`

### **Security & Validation**
- User email validation against system database
- Only active users with 'user' role can submit
- Automatic form rejection for unauthorized submitters
- Secure data transmission and validation

## 🌐 **Deployment**

### **Backend (Railway)**
- Automatic deployments from `main` branch
- PostgreSQL database via Supabase
- Environment variables configured in Railway dashboard

### **Frontend (Vercel)**
- Automatic deployments from repository
- Environment variables:
  ```
  REACT_APP_API_URL=https://sbcc-financial-system-production.up.railway.app
  REACT_APP_ENV=production
  ```

## 🔒 **Security Features**

- **CORS Protection**: Configured for specific origins
- **JWT Tokens**: Secure authentication with expiration
- **Google OAuth**: Industry-standard OAuth 2.0 flow
- **Role-Based Access**: Granular permission system
- **Input Validation**: Server-side data validation
- **Secret Management**: Environment-based configuration

## 📊 **Database Schema**

### **Key Tables**
- **users**: User accounts and roles
- **collections**: Church income records
- **expenses**: Church expense records
- **budget_categories**: Budget planning data

## 🆘 **Support**

- **Development Instructions**: See `CLAUDE.md`
- **Environment Setup**: All credentials configured
- **Google OAuth**: Fully integrated and tested
- **Production**: Live and operational

## 📄 **License**

Private church management system - Not for public distribution.

---

**System Status**: ✅ **Production Ready**  
**Last Updated**: September 2025  
**Google OAuth**: ✅ **Fully Configured**  
**Production Deployment**: ✅ **Live**