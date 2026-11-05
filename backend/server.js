require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const { Pool } = require('pg');
const { authenticateToken, isAdmin, checkPassword, generateToken } = require('./auth');

const app = express();
const PORT = process.env.PORT || 5000;
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// --- ETAT DU SYSTEME ---
let isLockdown = false;

// --- MIDDLEWARE DE LOCKDOWN ---
// Si le mode urgence est activé, on bloque toutes les requêtes non-GET (sauf login)
app.use((req, res, next) => {
  if (isLockdown && req.method !== 'GET' && !req.path.includes('/login') && !req.path.includes('/status')) {
    return res.status(503).json({ error: 'SYSTÈME EN LOCKDOWN : Toutes les requêtes sont bloquées pour raison de sécurité.' });
  }
  next();
});

const logAction = async (user, action, details) => {
  try {
    const name = user ? user.name : 'Inconnu';
    const role = user ? user.role : 'Inconnu';
    await pool.query('INSERT INTO logs_activite (user_name, user_role, action, details) VALUES ($1, $2, $3, $4)', [name, role, action, details]);
  } catch (e) { console.error("Erreur log:", e); }
};

const initDB = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS utilisateurs (id SERIAL PRIMARY KEY, name VARCHAR(100) UNIQUE NOT NULL, password VARCHAR(255) NOT NULL, role VARCHAR(50) NOT NULL, see_client_phone BOOLEAN DEFAULT true, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
      CREATE TABLE IF NOT EXISTS clients (id SERIAL PRIMARY KEY, telephone VARCHAR(50) UNIQUE NOT NULL, nom VARCHAR(100), adresse TEXT, whatsapp VARCHAR(50), created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
      CREATE TABLE IF NOT EXISTS commandes (id SERIAL PRIMARY KEY, client_id INTEGER REFERENCES clients(id), total DECIMAL(10,2), statut VARCHAR(50) DEFAULT 'en_attente', date_commande TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
      CREATE TABLE IF NOT EXISTS commande_items (id SERIAL PRIMARY KEY, commande_id INTEGER REFERENCES commandes(id) ON DELETE CASCADE, saveur_nom VARCHAR(100), quantite INTEGER, prix DECIMAL(10,2));
      CREATE TABLE IF NOT EXISTS codes_promo (id SERIAL PRIMARY KEY, code VARCHAR(50) UNIQUE NOT NULL, pourcentage INTEGER NOT NULL, actif BOOLEAN DEFAULT true, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
      CREATE TABLE IF NOT EXISTS zones (id SERIAL PRIMARY KEY, nom VARCHAR(100), lat DECIMAL(10,8), lng DECIMAL(11,8), rayon INTEGER, min_commande INTEGER);
      CREATE TABLE IF NOT EXISTS backup_commandes (id SERIAL PRIMARY KEY, date_backup TIMESTAMP DEFAULT CURRENT_TIMESTAMP, data JSONB);
      CREATE TABLE IF NOT EXISTS logs_activite (id SERIAL PRIMARY KEY, date_log TIMESTAMP DEFAULT CURRENT_TIMESTAMP, user_name VARCHAR(100), user_role VARCHAR(50), action VARCHAR(255), details TEXT);
    `);
    await pool.query('ALTER TABLE commandes ADD COLUMN IF NOT EXISTS livreur_id INTEGER REFERENCES utilisateurs(id);');
    await pool.query('ALTER TABLE commandes ADD COLUMN IF NOT EXISTS valide_par VARCHAR(100);');
    await pool.query('ALTER TABLE commandes ADD COLUMN IF NOT EXISTS promo_code VARCHAR(50);');
    await pool.query('ALTER TABLE commande_items ADD COLUMN IF NOT EXISTS prix_achat DECIMAL(10,2) DEFAULT 0;');
    console.log("✅ DB Ready !");
  } catch (e) { console.error("Erreur init DB:", e); }
};
initDB();

// ... (Routes clients, commandes, zones, etc. inchangées) ...
// [Je les omet ici pour la lisibilité, mais elles doivent rester exactement comme dans ton fichier actuel]

// --- ROUTES DE SECURITE ET D'URGENCE ---

app.get('/api/security/status', (req, res) => { res.json({ lockdown: isLockdown }); });

app.post('/api/admin/security/toggle-lockdown', authenticateToken, isAdmin, async (req, res) => {
  isLockdown = !isLockdown;
  const status = isLockdown ? 'ACTIVÉ' : 'DÉSACTIVÉ';
  await logAction(req.user, 'Protocole Lockdown', `Le mode urgence a été ${status}`);
  res.json({ success: true, lockdown: isLockdown });
});

app.post('/api/admin/security/simulate-attack', authenticateToken, isAdmin, async (req, res) => {
  await logAction({name: 'PIRATE_INCONNU', role: 'inconnu'}, 'Tentative Intrusion', 'Injection SQL détectée sur la route /api/clients');
  res.json({ success: true, message: 'Simulation enregistrée.' });
});

app.post('/api/admin/security/backup-wipe', authenticateToken, isAdmin, async (req, res) => {
  try {
    // 1. Backup complet de toutes les tables critiques
    const backupData = {
      date: new Date(),
      clients: (await pool.query('SELECT * FROM clients')).rows,
      commandes: (await pool.query('SELECT * FROM commandes')).rows,
      items: (await pool.query('SELECT * FROM commande_items')).rows,
      produits: (await pool.query('SELECT * FROM saveurs')).rows
    };
    
    // 2. Insertion dans la table de backup
    await pool.query('INSERT INTO backup_commandes (data) VALUES ($1)', [backupData]);
    
    // 3. Wipe des tables (CASCADE pour gérer les clés étrangères)
    await pool.query('TRUNCATE TABLE commande_items, commandes, clients, saveurs RESTART IDENTITY CASCADE');
    
    await logAction(req.user, 'Protocole Zero-Day', 'Backup complet effectué et base de données vidée.');
    res.json({ success: true, message: 'Sauvegarde effectuée et base nettoyée.' });
  } catch (e) { 
    console.error(e);
    res.status(500).json({ error: 'Erreur lors du wipe.' }); 
  }
});

app.get('/api/security/analyse', authenticateToken, isAdmin, async (req, res) => {
  try {
    const failedLogins = await pool.query("SELECT * FROM logs_activite WHERE action LIKE '%Connexion%' AND details LIKE '%Echouee%' ORDER BY date_log DESC LIMIT 20");
    const attackCount = await pool.query("SELECT COUNT(*) FROM logs_activite WHERE action LIKE '%Connexion%' AND details LIKE '%Echouee%' OR action LIKE '%Intrusion%'");
    res.json({ failedLogins: failedLogins.rows, totalAttacks: parseInt(attackCount.rows[0].count), isLockdown });
  } catch (e) { res.status(500).json({ error: 'Erreur analyse' }); }
});

// ... (reste des routes) ...

app.get('*', (req, res) => { res.sendFile(path.join(__dirname, 'public', 'index.html')); });
app.listen(PORT, () => console.log(`🚀 Serveur PUFF ZONE sur port ${PORT}`));