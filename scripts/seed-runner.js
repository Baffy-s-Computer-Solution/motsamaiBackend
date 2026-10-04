#!/usr/bin/env node
const path = require('path');
// Load .env first
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

// Force DB_SSL to false for local development to avoid SSL errors when connecting to local Postgres
process.env.DB_SSL = 'false';

const { runAllSeeders } = require('../src/seeders/index');

runAllSeeders()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Seeding failed:', err);
    process.exit(1);
  });
