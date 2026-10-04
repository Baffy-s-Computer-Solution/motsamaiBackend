#!/usr/bin/env node
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });
const config = require('../src/config');
console.log('process.env.DB_SSL =', process.env.DB_SSL);
console.log('process.env.REMOTE_DB_SSL =', process.env.REMOTE_DB_SSL);
console.log('process.env.DATABASE_URL =', process.env.DATABASE_URL ? process.env.DATABASE_URL.split('?')[0] : undefined);
console.log(JSON.stringify(config.DATABASE, null, 2));
