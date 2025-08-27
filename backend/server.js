const express = require("express");
const cors = require("cors");
const path = require("path");
require("dotenv").config();

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

// Middleware
app.use(cors());
app.use(express.json());

// Make database available to routes
app.use((req, res, next) => {
  req.db = db;
  next();
});

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/collections", collectionsRoutes);
app.use("/api/expenses", expensesRoutes);
app.use("/api/budget", budgetRoutes);
app.use("/api/forms", formsRoutes);

// Serve React frontend in production
if (process.env.NODE_ENV === 'production') {
  // Serve static files from React build
  app.use(express.static(path.join(__dirname, '..', 'frontend', 'build')));
  
  // Handle React routing - catch all other routes
  app.get('*', (req, res) => {
    // Only serve React app for non-API routes
    if (!req.path.startsWith('/api/')) {
      res.sendFile(path.join(__dirname, '..', 'frontend', 'build', 'index.html'));
    } else {
      res.status(404).json({ error: 'API endpoint not found' });
    }
  });
}

// Health check routes
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
