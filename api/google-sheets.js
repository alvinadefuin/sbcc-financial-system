const express = require('express');
const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('./_lib/auth');
// Shared middleware: also rejects a token whose tv is behind users.token_version.
const { verifyToken, checkRole } = require('./_lib/expressAuth');

const app = express();
app.use(express.json());

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  next();
});

const canExport = checkRole(['super_admin', 'admin']);

// GET /api/google-sheets/status
app.get('/api/google-sheets/status', verifyToken, (req, res) => {
  res.json({
    success: true,
    configured: false,
    message: 'Google Sheets integration not available in serverless environment. Use the Reports tab sync instead.',
  });
});

// POST /api/google-sheets/export
// Stubs today, but an export writes church finances outward. Gate them now so
// implementing one later cannot quietly ship it open to every signed-in account.
app.post('/api/google-sheets/export', verifyToken, canExport, (req, res) => {
  res.status(503).json({
    success: false,
    message: 'Google Sheets export is not available in the serverless environment. Use the Reports tab sync instead.',
  });
});

// POST /api/google-sheets/test
app.post('/api/google-sheets/test', verifyToken, canExport, (req, res) => {
  res.status(503).json({
    success: false,
    message: 'Google Sheets test not available in serverless environment.',
  });
});

module.exports = app;
