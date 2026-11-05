const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
require('dotenv').config();

// Si la variable n'existe pas sur Railway, on met une clé par défaut pour éviter les déconnexions au redémarrage
const SECRET_KEY = process.env.JWT_SECRET || 'puff_zone_secret_key_2026_super_secure';

const generateToken = (user) => {
  return jwt.sign({ id: user.id, name: user.name, role: user.role }, SECRET_KEY, { expiresIn: '24h' });
};

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Token manquant' });

  jwt.verify(token, SECRET_KEY, (err, user) => {
    // ON RENVOIE 401 ICI (et non 403) POUR QUE LE FRONT TE DÉCONNECTE PROPREMENT
    if (err) return res.status(401).json({ error: 'Token invalide ou expiré' });
    req.user = user;
    next();
  });
};

const isAdmin = (req, res, next) => {
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