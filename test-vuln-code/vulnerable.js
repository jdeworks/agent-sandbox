// Test file with known vulnerabilities for OpenGrep scanner testing

// 1. Hardcoded API key (secret)
const API_KEY = 'sk_live_abcdefghijklmnopqrstuvwxyz123456';

// 2. SQL Injection vulnerability
function getUserData(userId) {
  const query = 'SELECT * FROM users WHERE id = ' + userId;
  return db.execute(query);
}

// 3. Command Injection
const exec = require('child_process').exec;
function runCommand(input) {
  exec('ls -la ' + input);
}

// 4. XSS vulnerability
function renderUserName(name) {
  return '<div>' + name + '</div>';
}

// 5. Insecure random
function generateToken() {
  return Math.random().toString(36);
}
