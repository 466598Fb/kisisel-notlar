const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'default-dev-secret-change-in-production';
const JWT_EXPIRES = '7d';

module.exports = {
  async hashPassword(password) {
    return bcrypt.hash(password, 12);
  },
  async comparePassword(password, hash) {
    return bcrypt.compare(password, hash);
  },
  generateToken(payload) {
    return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES });
  },
  verifyToken(token) {
    try { return jwt.verify(token, JWT_SECRET); }
    catch { return null; }
  }
};
