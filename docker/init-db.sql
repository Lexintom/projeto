-- Initialize database extensions and settings
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Set timezone
SET timezone = 'UTC';

-- Create schema for application
CREATE SCHEMA IF NOT EXISTS jungle;
CREATE DATABASE jungle_gaming_test;
