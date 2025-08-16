const express = require("express");
const cors = require("cors");
require("dotenv").config();

// Import database
const database = require("./config/database");
const db = database.getDatabase();

// Import routes
const authRoutes = require("./routes/auth");
const collectionsRoutes = require("./routes/collections");
const expensesRoutes = require("./routes/expenses");
const budgetRoutes = require("./routes/budget");

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

// Health check
app.get("/api/health", (req, res) => {
  res.json({ status: "OK", message: "SBCC Financial API is running" });
});

app.listen(PORT, () => {
  console.log(`🚀 SBCC Financial API running on http://localhost:${PORT}`);
  console.log(`📊 Database: SQLite`);
  console.log(`🔑 Default admin: admin@sbcc.church / admin123`);
});
