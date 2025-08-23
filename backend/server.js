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
  res.json({ status: "OK", message: "SBCC Financial API is running" });
});

app.listen(PORT, () => {
  console.log(`🚀 SBCC Financial API running on http://localhost:${PORT}`);
  console.log(`📊 Database: SQLite`);
  console.log(`🔑 Default admin: admin@sbcc.church / admin123`);
});
