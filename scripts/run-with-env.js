#!/usr/bin/env node
/*
  run-with-env.js
  Loads .env and runs a shell command so environment variables are available
  Usage: node scripts/run-with-env.js "npx sequelize db:migrate"
*/
const { spawn } = require('child_process');
const path = require('path');

// Load dotenv from project root
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error('Usage: node scripts/run-with-env.js "<command>"');
  process.exit(1);
}

const cmd = args.join(' ');
console.log(`Running command with .env loaded: ${cmd}`);

const child = spawn(cmd, { shell: true, stdio: 'inherit', cwd: path.resolve(__dirname, '..') });

child.on('exit', code => {
  process.exit(code);
});
