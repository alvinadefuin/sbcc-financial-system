const express = require("express");
const cors = require("cors");
const path = require("path");

// Load environment-specific configuration
const environment = process.env.NODE_ENV || 'development';

// Load base environment file first
require("dotenv").config({ 
  path: path.join(__dirname, `.env.${environment}`) 
});

// Load local environment file to override with secrets (if exists)
require("dotenv").config({ 
  path: path.join(__dirname, `.env.${environment}.local`),
  override: true // Override template values with real secrets
});

console.log(`🌍 Environment: ${environment}`);

// Import database
const database = require("./config/database");
const db = database.getDatabase();

// Import routes
const authRoutes = require("./routes/auth");
const collectionsRoutes = require("./routes/collections");
const expensesRoutes = require("./routes/expenses");
const budgetRoutes = require("./routes/budget");
const formsRoutes = require("./routes/forms");

const app = express();
const PORT = process.env.PORT || 3001;

// CORS Configuration
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    const allowedOrigins = [
      process.env.FRONTEND_URL, // From .env file (localhost:3000 or production frontend)
      'http://localhost:3000',  // Always allow local development
      'http://localhost:3001',  // Allow backend itself
    ];
    
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    
    const msg = 'The CORS policy for this site does not allow access from the specified origin.';
    return callback(new Error(msg), false);
  },
  credentials: true,
};

// Middleware
app.use(cors(corsOptions));
app.use(express.json());

// Make database available to routes
app.use((req, res, next) => {
  req.db = db;
  next();
});

// Health check routes (MUST be before other routes)
app.get("/", (req, res) => {
  res.json({ 
    status: "OK", 
    message: "SBCC Financial API is running",
    version: "1.0.0",
    timestamp: new Date().toISOString()
  });
});

app.get("/api/health", (req, res) => {
  const dbType = process.env.USE_POSTGRESQL === 'true' || process.env.DATABASE_URL?.startsWith('postgres') 
    ? 'PostgreSQL' 
    : 'SQLite';
  res.json({ 
    status: "OK", 
    message: "SBCC Financial API is running",
    database: dbType,
    timestamp: new Date().toISOString()
  });
});

// API Routes
app.use("/api/auth", authRoutes);
app.use("/api/collections", collectionsRoutes);
app.use("/api/expenses", expensesRoutes);
app.use("/api/budget", budgetRoutes);
app.use("/api/forms", formsRoutes);

// Database test endpoint (for debugging)
app.get("/api/test-db", async (req, res) => {
  try {
    const dbType = process.env.USE_POSTGRESQL === 'true' || process.env.DATABASE_URL?.startsWith('postgres');
    
    if (dbType) {
      // Test PostgreSQL
      req.db.get("SELECT NOW() as time, COUNT(*) as user_count FROM users", [], (err, result) => {
        if (err) {
          return res.status(500).json({ error: err.message });
        }
        res.json({
          database: "PostgreSQL (Supabase)",
          connected: true,
          serverTime: result?.time,
          userCount: result?.user_count,
          databaseUrl: process.env.DATABASE_URL?.replace(/:[^:@]*@/, ':****@')
        });
      });
    } else {
      // Test SQLite
      req.db.get("SELECT datetime('now') as time, COUNT(*) as user_count FROM users", [], (err, result) => {
        if (err) {
          return res.status(500).json({ error: err.message });
        }
        res.json({
          database: "SQLite",
          connected: true,
          serverTime: result?.time,
          userCount: result?.user_count
        });
      });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Catch-all 404 handler (must be last)
app.use((req, res) => {
  res.status(404).json({ 
    error: "Endpoint not found",
    path: req.path,
    method: req.method
  });
});

app.listen(PORT, '0.0.0.0', () => {
  const dbType = process.env.USE_POSTGRESQL === 'true' || process.env.DATABASE_URL?.startsWith('postgres') 
    ? 'PostgreSQL (Supabase)' 
    : 'SQLite';
  console.log(`🚀 SBCC Financial API running on port ${PORT}`);
  console.log(`📊 Database: ${dbType}`);
  console.log(`🔑 Default admin: admin@sbcc.church / admin123`);
  console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
  
  // Log successful startup for Railway health checks
  if (process.env.NODE_ENV === 'production') {
    console.log(`✅ Server ready - health check available at /api/health`);
  }
});
