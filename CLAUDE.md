# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

SBCC Financial System is a church financial management application with Google Forms integration. It's a full-stack application consisting of:

- **Backend**: Node.js/Express API with SQLite database
- **Frontend**: React application with Tailwind CSS
- **Database**: SQLite with financial records (collections and expenses)

## Development Commands

### Backend Development
```bash
cd backend
npm start          # Start production server
npm run dev        # Start development server with nodemon
npm test           # Run tests (currently placeholder)
```

### Frontend Development
```bash
cd frontend
npm start          # Start development server (http://localhost:3000)
npm run build      # Build for production
npm test           # Run React tests
```

### Full Application Setup
1. Start backend: `cd backend && npm run dev` (runs on port 3001)
2. Start frontend: `cd frontend && npm start` (runs on port 3000)
3. Default admin login: admin@sbcc.church / admin123

## Architecture Overview

### Backend Structure
- **server.js**: Main Express server with middleware setup
- **config/database.js**: SQLite database configuration and initialization
- **routes/**: API endpoints organized by feature
  - `auth.js`: Authentication and user management
  - `collections.js`: Church collection records with CRUD operations
  - `expenses.js`: Church expense records with CRUD operations
- **middleware/auth.js**: JWT authentication middleware

### Frontend Structure
- **src/App.js**: Main application with authentication flow
- **src/components/**: React components
  - `Login.js`: Authentication interface
  - `Dashboard.js`: Main dashboard with analytics and charts
  - `FinancialRecordsManager.js`: CRUD interface for financial records
- **src/utils/api.js**: Centralized API service with axios interceptors

### Database Schema
- **users**: Admin and user accounts with roles
- **collections**: Church income records with categorized amounts (tithes, offerings, operating funds, etc.)
- **expenses**: Church expense records with categorized spending (workers share, supplies, utilities, etc.)

## Key Features

### Financial Records Management
- Collections tracking with multiple fund categories
- Expense tracking with departmental breakdown
- Monthly/yearly filtering and reporting
- CRUD operations for both collections and expenses

### Authentication & Authorization
- JWT-based authentication
- Role-based access (admin/user)
- Automatic token refresh and logout on expiry

### Data Visualization
- Interactive charts using Recharts library
- Financial summaries and analytics
- Month-over-month comparisons

## Development Notes

### Database Management
- SQLite database auto-initializes on first run
- Schema defined in `backend/config/database.js:24-66`
- Seeding scripts available for test data
- Database file located at `database/church_financial.db`

### API Patterns
- RESTful endpoints with consistent error handling
- JWT authentication required for all protected routes
- Request/response interceptors handle auth tokens automatically
- Month/year query parameters for filtering financial records

### Frontend State Management
- React hooks for local state management
- API service layer abstracts backend communication
- Automatic re-authentication on page refresh
- Loading states and error handling throughout UI

### Security Considerations
- JWT tokens stored in localStorage
- Password hashing with bcryptjs
- CORS enabled for frontend-backend communication
- Input validation on both client and server

## File Locations for Common Tasks

- Add new API endpoint: `backend/routes/`
- Add new React component: `frontend/src/components/`
- Database schema changes: `backend/config/database.js`
- API service methods: `frontend/src/utils/api.js`
- Styling: Uses Tailwind CSS classes throughout components