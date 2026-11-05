const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const SECRET_KEY = process.env.JWT_SECRET || 'puff_zone_secret_key_2026';

const generateToken = (user) => {
  return jwt.sign({ id: user.id, name: user.name, role: user.role }, SECRET_KEY, { expiresIn: '24h' });
};

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Token manquant' });

  jwt.verify(token, SECRET_KEY, (err, user) => {
    if (err) return res.status(403).json({ error: 'Token invalide' });
    req.user = user;
    next();
  });
};

const isAdmin = (req, res, next) => {
  // ON AUTORISE 'admin' ET 'dev' ICI
  if (req.user && (req.user.role === 'admin' || req.user.role === 'dev')) {
    next();
  } else {
    res.status(403).json({ error: 'Accès refusé : admin ou dev requis' });
  }
};

const checkPassword = async (password, hashedPassword) => {
  return await bcrypt.compare(password, hashedPassword);
};

module.exports = { authenticateToken, isAdmin, checkPassword, generateToken };