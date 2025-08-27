-- SBCC Financial System - Supabase Database Setup
-- Copy and paste this entire script into your Supabase SQL Editor

-- Create users table
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  role TEXT CHECK(role IN ('super_admin', 'admin', 'user')) DEFAULT 'user',
  google_id TEXT UNIQUE,
  profile_picture TEXT,
  password_hash TEXT,
  is_active BOOLEAN DEFAULT true,
  last_login TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_by TEXT,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create collections table
CREATE TABLE IF NOT EXISTS collections (
  id SERIAL PRIMARY KEY,
  date DATE NOT NULL,
  particular TEXT NOT NULL,
  control_number TEXT UNIQUE,
  payment_method TEXT DEFAULT 'Cash',
  total_amount DECIMAL(10,2) NOT NULL,
  general_tithes_offering DECIMAL(10,2) DEFAULT 0,
  bank_interest DECIMAL(10,2) DEFAULT 0,
  sisterhood_san_juan DECIMAL(10,2) DEFAULT 0,
  sisterhood_labuin DECIMAL(10,2) DEFAULT 0,
  brotherhood DECIMAL(10,2) DEFAULT 0,
  youth DECIMAL(10,2) DEFAULT 0,
  couples DECIMAL(10,2) DEFAULT 0,
  sunday_school DECIMAL(10,2) DEFAULT 0,
  special_purpose_pledge DECIMAL(10,2) DEFAULT 0,
  pbcm_share DECIMAL(10,2) DEFAULT 0,
  pastoral_team_share DECIMAL(10,2) DEFAULT 0,
  operational_fund_share DECIMAL(10,2) DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_by TEXT,
  submitted_via TEXT DEFAULT 'web'
);

-- Create expenses table
CREATE TABLE IF NOT EXISTS expenses (
  id SERIAL PRIMARY KEY,
  date DATE NOT NULL,
  particular TEXT NOT NULL,
  forms_number TEXT,
  cheque_number TEXT,
  category TEXT NOT NULL,
  subcategory TEXT,
  total_amount DECIMAL(10,2) NOT NULL,
  budget_amount DECIMAL(10,2) DEFAULT 0,
  percentage_allocation DECIMAL(5,2) DEFAULT 0,
  fund_source TEXT DEFAULT 'operational',
  pbcm_share_expense DECIMAL(10,2) DEFAULT 0,
  pastoral_worker_support DECIMAL(10,2) DEFAULT 0,
  cap_assistance DECIMAL(10,2) DEFAULT 0,
  honorarium DECIMAL(10,2) DEFAULT 0,
  conference_seminar DECIMAL(10,2) DEFAULT 0,
  fellowship_events DECIMAL(10,2) DEFAULT 0,
  anniversary_christmas DECIMAL(10,2) DEFAULT 0,
  supplies DECIMAL(10,2) DEFAULT 0,
  utilities DECIMAL(10,2) DEFAULT 0,
  vehicle_maintenance DECIMAL(10,2) DEFAULT 0,
  lto_registration DECIMAL(10,2) DEFAULT 0,
  transportation_gas DECIMAL(10,2) DEFAULT 0,
  building_maintenance DECIMAL(10,2) DEFAULT 0,
  abccop_national DECIMAL(10,2) DEFAULT 0,
  cbcc_share DECIMAL(10,2) DEFAULT 0,
  kabalikat_share DECIMAL(10,2) DEFAULT 0,
  abccop_community DECIMAL(10,2) DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_by TEXT,
  submitted_via TEXT DEFAULT 'web'
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_collections_date ON collections(date);
CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(date);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- Insert default admin user
INSERT INTO users (email, name, role, password_hash, created_by)
VALUES ('admin@sbcc.church', 'Church Super Administrator', 'super_admin', '$2a$10$8K4Q1kWZf7Z1cXhF2m1g6uFKG4QJX9I6F8B1w7P2Lp3Vz5X2Y4Nq8', 'system')
ON CONFLICT (email) DO NOTHING;

-- Insert test user for forms
INSERT INTO users (email, name, role, password_hash, is_active, created_by)
VALUES ('member@sbcc.church', 'Test Member', 'user', '$2a$10$RXO.8QfO1G9LRFv.Zp2.5.tSP5nD3jHm6B1c9Y8L4K3V7X5M2p6Z4', true, 'system')
ON CONFLICT (email) DO NOTHING;

-- Verify setup
SELECT 'Setup complete!' as status;
SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;