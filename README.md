# SBCC Financial Management System

A comprehensive church financial management application with Google OAuth integration, designed for tracking collections, expenses, budget planning, and generating detailed financial reports.

## 🚀 Features

### 📊 Financial Management
- **Collections Tracking**: Record and categorize church income (tithes, offerings, operating funds, etc.)
- **Expense Management**: Track departmental spending with detailed breakdown categories
- **Budget Planning**: Create and manage annual budgets with category-wise allocation
- **Fund Allocation**: Monitor fund distribution across different church activities

### 📈 Analytics & Reporting
- **Interactive Dashboards**: Real-time financial analytics with charts and graphs
- **Print Reports**: Generate professional reports with date range filtering
- **Monthly/Yearly Comparisons**: Track financial trends over time
- **Budget vs Actual Analysis**: Compare planned vs actual spending

### 🔐 Authentication & Security
- **Google OAuth Integration**: Secure login with Google accounts
- **Role-Based Access Control**: Admin and user permission levels
- **JWT Authentication**: Secure API access with token-based auth
- **User Management**: Admin interface for managing user accounts

### 💡 User Experience
- **Responsive Design**: Works seamlessly on desktop and mobile devices
- **Currency Formatting**: Automatic currency formatting with locale support
- **Real-time Validation**: Form validation with helpful error messages
- **Auto-calculation**: Smart total calculation from breakdown amounts

## 🛠 Technology Stack

### Backend
- **Node.js** with Express.js framework
- **SQLite** database with auto-initialization
- **JWT** for authentication
- **bcryptjs** for password hashing
- **Google Auth Library** for OAuth integration

### Frontend
- **React** with hooks for state management
- **Tailwind CSS** for styling
- **Recharts** for data visualization
- **Lucide React** for icons
- **Axios** for API communication

## 🚀 Quick Start

### Prerequisites
- Node.js (v14 or higher)
- npm or yarn package manager

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/alvinadefuin/sbcc-financial-system.git
   cd sbcc-financial-system
   ```

2. **Setup Backend**
   ```bash
   cd backend
   npm install
   cp .env.example .env
   # Edit .env with your configuration
   npm run dev
   ```

3. **Setup Frontend**
   ```bash
   cd frontend
   npm install
   npm start
   ```

### Environment Configuration

Create a `.env` file in the `backend` directory:

```env
# JWT Secret for authentication tokens
JWT_SECRET=your-secret-key-change-this-in-production

# Google OAuth Configuration
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret

# Server Configuration
PORT=3001
```

### Default Access
- **URL**: http://localhost:3000
- **Admin Login**: admin@sbcc.church / admin123

## 📋 Google OAuth Setup

1. **Create Google Cloud Project**
   - Go to [Google Cloud Console](https://console.cloud.google.com/)
   - Create a new project or select existing one

2. **Enable Google+ API**
   - Navigate to APIs & Services > Library
   - Search and enable "Google+ API"

3. **Create OAuth 2.0 Credentials**
   - Go to APIs & Services > Credentials
   - Click "Create Credentials" > "OAuth 2.0 Client ID"
   - Set Application type to "Web application"

4. **Configure Authorized Origins**
   - Authorized JavaScript origins: `http://localhost:3000`
   - Authorized redirect URIs: `http://localhost:3000`

5. **Update Environment Variables**
   - Copy Client ID and Client Secret to your `.env` file

## 🗂 Project Structure

```
sbcc-financial-system/
├── backend/                 # Node.js API server
│   ├── config/
│   │   └── database.js     # SQLite database configuration
│   ├── routes/
│   │   ├── auth.js         # Authentication endpoints
│   │   ├── collections.js  # Collection CRUD operations
│   │   └── expenses.js     # Expense CRUD operations
│   ├── services/
│   │   └── googleAuth.js   # Google OAuth service
│   ├── middleware/
│   │   └── auth.js         # JWT authentication middleware
│   └── server.js           # Express server setup
├── frontend/               # React application
│   ├── public/
│   │   └── index.html      # HTML template with Google services
│   └── src/
│       ├── components/     # React components
│       │   ├── Dashboard.js
│       │   ├── LoginNew.js
│       │   ├── FinancialRecordsManagerNew.js
│       │   └── PrintReportModal.js
│       └── utils/
│           └── api.js      # API service layer
├── database/               # SQLite database files
└── CLAUDE.md              # Development guidance
```

## 🔧 Development Commands

### Backend Development
```bash
cd backend
npm start          # Production server
npm run dev        # Development with nodemon
npm test           # Run tests
```

### Frontend Development
```bash
cd frontend
npm start          # Development server (http://localhost:3000)
npm run build      # Production build
npm test           # Run React tests
npm run lint       # Code linting
```

## 📊 Database Schema

### Users Table
- User authentication and role management
- Google OAuth integration fields
- Activity tracking (last login, created by)

### Collections Table
- Church income records with categorized amounts
- Fields: date, control_number, description, various fund categories
- Auto-calculated totals with manual override option

### Expenses Table
- Church expense records with departmental breakdown
- Fields: date, description, various expense categories
- Budget category linking for comparison

### Budget Plans Table
- Annual budget planning with category allocations
- Monthly distribution and tracking capabilities

## 🛡 Security Features

- **Password Security**: bcrypt hashing with salt rounds
- **JWT Tokens**: Secure authentication with 24-hour expiration
- **Input Validation**: Server-side validation for all inputs
- **CORS Protection**: Configured for frontend-backend communication
- **Role-based Access**: Different permission levels for users and admins

## 📱 API Endpoints

### Authentication
- `POST /api/auth/login` - Password login
- `POST /api/auth/google` - Google OAuth login
- `GET /api/auth/me` - Get current user
- `GET /api/auth/google/config` - Google OAuth configuration

### Financial Data
- `GET /api/collections` - Fetch collections with filtering
- `POST /api/collections` - Add new collection
- `PUT /api/collections/:id` - Update collection
- `DELETE /api/collections/:id` - Delete collection
- `GET /api/expenses` - Fetch expenses with filtering
- `POST /api/expenses` - Add new expense

### User Management (Admin only)
- `GET /api/auth/users` - List all users
- `POST /api/auth/users` - Create new user
- `PUT /api/auth/users/:id` - Update user
- `DELETE /api/auth/users/:id` - Delete user

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

For support and questions:
- Create an issue in the GitHub repository
- Contact the development team
- Check the [CLAUDE.md](CLAUDE.md) file for development guidance

## 🎯 Roadmap

- [ ] Mobile app development
- [ ] Advanced reporting features
- [ ] Integration with accounting software
- [ ] Multi-church support
- [ ] Automated backup system
- [ ] Email notifications
- [ ] Financial forecasting tools

---

© 2025 SBCC Financial Management System. Professional church financial management solution.
