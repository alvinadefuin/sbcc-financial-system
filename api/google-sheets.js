const express = require('express');
const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('./_lib/auth');

const app = express();
app.use(express.json());

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization, x-webhook-secret');
  if (req.method === 'OPTIONS') return res.status(200).end();
  next();
});

function verifyToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token provided' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (err) {
    return res.status(403).json({ error: 'Invalid token' });
  }
}

// GET /api/google-sheets/status
app.get('/api/google-sheets/status', verifyToken, (req, res) => {
  res.json({
    success: true,
    configured: false,
    message: 'Google Sheets integration not available in serverless environment. Use n8n automation instead.',
  });
});

// POST /api/google-sheets/export
app.post('/api/google-sheets/export', verifyToken, (req, res) => {
  res.status(503).json({
    success: false,
    message: 'Google Sheets export is not available in the serverless environment. Use the n8n automation workflow instead.',
  });
});

// POST /api/google-sheets/test
app.post('/api/google-sheets/test', verifyToken, (req, res) => {
  res.status(503).json({
    success: false,
    message: 'Google Sheets test not available in serverless environment.',
  });
});

module.exports = app;
