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

// --- MIDDLEWARE DE LOCKDOWN (URGENCE) ---
app.use((req, res, next) => {
  if (isLockdown && req.method !== 'GET') {
    // On autorise le login et les routes pour désactiver le lockdown
    if (req.path.includes('/login') || req.path.includes('/security/toggle-lockdown') || req.path.includes('/security/backup-wipe')) {
       return next();
    }
    return res.status(503).json({ error: 'SYSTÈME EN LOCKDOWN : Les commandes sont temporairement bloquées.' });
  }
  next();
});

// --- LIMITEUR DE TENTATIVES ---
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10, // Augmenté un peu pour éviter de te bloquer pendant les tests
  message: { error: 'Trop de tentatives. Réessayez dans 15 min.' }
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

// --- HEALTH CHECK ---
app.get('/api/health', async (req, res) => {
  try { await pool.query('SELECT 1'); res.json({ status: 'ok', db: 'connected', lockdown: isLockdown }); }
  catch (e) { res.status(500).json({ status: 'error' }); }
});

// --- AUTHENTIFICATION & LOGIN ---
app.post('/api/login', loginLimiter, async (req, res) => {
  const { name, password } = req.body;
  try {
    const r = await pool.query('SELECT * FROM utilisateurs WHERE name=$1', [name]);
    if (r.rows.length === 0) {
      await logAction({name, role: 'inconnu'}, 'Connexion Echouee', `Tentative: ${name}`);
      return res.status(401).json({ error: 'Identifiants incorrects' });
    }
    const user = r.rows[0];
    const validPassword = await checkPassword(password, user.password);
    if (!validPassword) {
      await logAction({name, role: 'inconnu'}, 'Connexion Echouee', `Mdp incorrect: ${name}`);
      return res.status(401).json({ error: 'Identifiants incorrects' });
    }
    const token = generateToken(user);
    await logAction({name, role: user.role}, 'Connexion Reussie', `Utilisateur: ${name}`);
    res.json({ success: true, token, user: { id: user.id, name: user.name, role: user.role } });
  } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
});

app.post('/api/login-livreur', loginLimiter, async (req, res) => {
  const { name, password } = req.body;
  try {
    const r = await pool.query("SELECT * FROM utilisateurs WHERE name=$1 AND role='livreur'", [name]);
    if (r.rows.length === 0) return res.status(401).json({ error: 'Identifiants incorrects' });
    const livreur = r.rows[0];
    const validPassword = await checkPassword(password, livreur.password);
    if (!validPassword) return res.status(401).json({ error: 'Identifiants incorrects' });
    const token = generateToken(livreur);
    await logAction({name, role: 'livreur'}, 'Connexion Livreur', `Utilisateur: ${name}`);
    res.json({ success: true, token, livreur: { id: livreur.id, name: livreur.name, role: livreur.role } });
  } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// --- CLIENTS ---
app.post('/api/clients/register', async (req, res) => {
  const { telephone, nom, adresse, whatsapp } = req.body;
  try {
    let r = await pool.query('SELECT * FROM clients WHERE telephone = $1', [telephone]);
    if (r.rows.length === 0) {
      r = await pool.query('INSERT INTO clients (telephone, nom, adresse, whatsapp) VALUES ($1,$2,$3,$4) RETURNING *', [telephone, nom, adresse, whatsapp]);
    } else {
      r = await pool.query('UPDATE clients SET nom=$1, adresse=$2, whatsapp=$3 WHERE telephone=$4 RETURNING *', [nom, adresse, whatsapp, telephone]);
    }
    res.json({ success: true, client: r.rows[0] });
  } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
});

app.post('/api/clients/login', async (req, res) => {
  const { telephone } = req.body;
  try {
    const r = await pool.query('SELECT * FROM clients WHERE telephone = $1', [telephone]);
    if (r.rows.length === 0) return res.status(404).json({ success: false, error: 'Numéro non reconnu' });
    res.json({ success: true, client: r.rows[0] });
  } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
});

app.put('/api/clients/:id', async (req, res) => {
  const { nom, adresse, whatsapp } = req.body;
  try {
    const r = await pool.query('UPDATE clients SET nom=$1, adresse=$2, whatsapp=$3 WHERE id=$4 RETURNING *', [nom, adresse, whatsapp, req.params.id]);
    res.json({ success: true, client: r.rows[0] });
  } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
});

app.get('/api/clients/:id/commandes', async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT c.*, (SELECT json_agg(json_build_object('saveur', ci.saveur_nom, 'qte', ci.quantite, 'prix', ci.prix)) FROM commande_items ci WHERE ci.commande_id = c.id) as items
      FROM commandes c WHERE c.client_id = $1 ORDER BY c.date_commande DESC
    `, [req.params.id]);
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
});

app.get('/api/clients', authenticateToken, isAdmin, async (req, res) => {
  try { const r = await pool.query('SELECT * FROM clients ORDER BY created_at DESC'); res.json(r.rows); }
  catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// --- CODES PROMO ---
app.post('/api/promo/check', async (req, res) => {
  const { code } = req.body;
  try {
    const r = await pool.query('SELECT * FROM codes_promo WHERE UPPER(code) = UPPER($1) AND actif = true', [code]);
    if (r.rows.length === 0) return res.status(404).json({ success: false, error: 'Code invalide' });
    res.json({ success: true, pourcentage: r.rows[0].pourcentage });
  } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
});

app.get('/api/promo', authenticateToken, isAdmin, async (req, res) => {
  try { const r = await pool.query('SELECT * FROM codes_promo ORDER BY created_at DESC'); res.json(r.rows); }
  catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
});

app.post('/api/promo', authenticateToken, isAdmin, async (req, res) => {
  const { code, pourcentage } = req.body;
  try {
    const r = await pool.query('INSERT INTO codes_promo (code, pourcentage) VALUES ($1, $2) RETURNING *', [code.toUpperCase(), pourcentage]);
    await logAction(req.user, 'Creation Code Promo', `Code: ${code.toUpperCase()}`);
    res.json(r.rows[0]);
  } catch (e) { res.status(500).json({ error: "Ce code existe déjà !" }); }
});

app.delete('/api/promo/:id', authenticateToken, isAdmin, async (req, res) => {
  try { await pool.query('DELETE FROM codes_promo WHERE id=$1', [req.params.id]); await logAction(req.user, 'Suppression Code Promo', `ID: ${req.params.id}`); res.json({ success: true }); }
  catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// --- COMMANDES ---
app.post('/api/commandes', async (req, res) => {
  const { client_id, cart, total, promo_code, valide_par } = req.body;
  try {
    for (const item of cart) {
      const stockCheck = await pool.query('SELECT stock FROM saveurs WHERE nom = $1', [item.nom]);
      if (stockCheck.rows.length === 0) return res.status(400).json({ error: `La saveur "${item.nom}" n'existe plus.` });
      if (item.qty > stockCheck.rows[0].stock) return res.status(400).json({ error: `Stock insuffisant pour "${item.nom}".` });
    }

    let finalTotal = parseFloat(total);
    if (promo_code) {
      const promo = await pool.query('SELECT * FROM codes_promo WHERE UPPER(code) = UPPER($1) AND actif = true', [promo_code]);
      if (promo.rows.length > 0) { finalTotal = finalTotal - (finalTotal * (promo.rows[0].pourcentage / 100)); }
    }

    const cmd = await pool.query('INSERT INTO commandes (client_id, total, valide_par, promo_code) VALUES ($1,$2,$3,$4) RETURNING id', [client_id, finalTotal, valide_par || 'Client', promo_code || null]);
    const cmdId = cmd.rows[0].id;

    for (const item of cart) {
      await pool.query('INSERT INTO commande_items (commande_id, saveur_nom, quantite, prix) VALUES ($1,$2,$3,$4)', [cmdId, item.nom, item.qty, item.prix]);
      await pool.query('UPDATE saveurs SET stock = stock - $1 WHERE nom = $2', [item.qty, item.nom]);
    }
    await logAction({name: valide_par || 'Client', role: 'client'}, 'Nouvelle Commande', `Commande #${cmdId} - Total: ${finalTotal.toFixed(2)}`);
    res.json({ success: true, commande_id: cmdId, finalTotal });
  } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
});

app.get('/api/commandes', authenticateToken, isAdmin, async (req, res) => {
  try { const r = await pool.query(`SELECT c.*, COALESCE(NULLIF(cl.nom, ''), 'Client ' || cl.telephone) as client_nom, cl.telephone, cl.whatsapp, cl.adresse FROM commandes c LEFT JOIN clients cl ON c.client_id = cl.id ORDER BY c.date_commande DESC`); res.json(r.rows); }
  catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
});

app.put('/api/commandes/:id/statut', authenticateToken, async (req, res) => {
  const { statut } = req.body;
  try {
    const check = await pool.query('SELECT statut FROM commandes WHERE id=$1', [req.params.id]);
    if (check.rows.length > 0 && check.rows[0].statut === 'livre') return res.status(400).json({ error: 'Commande déjà livrée.' });
    await pool.query('UPDATE commandes SET statut=$1 WHERE id=$2', [statut, req.params.id]);
    await logAction(req.user, 'Changement Statut', `Commande #${req.params.id} -> ${statut}`);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
});

app.put('/api/commandes/:id/assign', authenticateToken, isAdmin, async (req, res) => {
  const { livreur_id } = req.body;
  try {
    await pool.query('UPDATE commandes SET livreur_id = $1 WHERE id = $2', [livreur_id, req.params.id]);
    await logAction(req.user, 'Assignation Livreur', `Commande #${req.params.id} -> Livreur ID ${livreur_id}`);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
});

app.get('/api/commandes/livreur/:id', authenticateToken, async (req, res) => {
  try { const r = await pool.query(`SELECT c.*, COALESCE(NULLIF(cl.nom, ''), 'Client ' || cl.telephone) as client_nom, cl.telephone, cl.whatsapp, cl.adresse FROM commandes c LEFT JOIN clients cl ON c.client_id = cl.id WHERE c.livreur_id = $1 AND c.statut != 'livre' ORDER BY c.date_commande DESC`, [req.params.id]); res.json(r.rows); }
  catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
});

app.get('/api/commandes/livreur/:id/historique', authenticateToken, async (req, res) => {
  try { const r = await pool.query(`SELECT c.id, c.total, c.date_commande, COALESCE(NULLIF(cl.nom, ''), 'Client ' || cl.telephone) as client_nom FROM commandes c LEFT JOIN clients cl ON c.client_id = cl.id WHERE c.livreur_id = $1 AND c.statut = 'livre' ORDER BY c.date_commande DESC`, [req.params.id]); res.json(r.rows); }
  catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
});

app.get('/api/livreur/:id/stats', authenticateToken, async (req, res) => {
  try { const r = await pool.query(`SELECT COUNT(id) as total_livraisons, COALESCE(SUM(total), 0) as total_ca FROM commandes WHERE livreur_id = $1 AND statut = 'livre'`, [req.params.id]); res.json(r.rows[0]); }
  catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// --- STATS & UTILISATEURS ---
app.get('/api/stats', authenticateToken, isAdmin, async (req, res) => {
  try {
    const top = await pool.query(`SELECT saveur_nom, SUM(quantite) as total_qte FROM commande_items GROUP BY saveur_nom ORDER BY total_qte DESC LIMIT 5`);
    const ca7jours = await pool.query(`SELECT TO_CHAR(date_commande, 'DD/MM') as jour, SUM(total) as ca FROM commandes WHERE statut = 'livre' AND date_commande >= NOW() - INTERVAL '7 days' GROUP BY TO_CHAR(date_commande, 'DD/MM'), DATE_TRUNC('day', date_commande) ORDER BY DATE_TRUNC('day', date_commande) ASC`);
    res.json({ topSaveurs: top.rows, ca7jours: ca7jours.rows });
  } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
});

app.get('/api/utilisateurs', authenticateToken, isAdmin, async (req, res) => { try { const r = await pool.query('SELECT id,name,role FROM utilisateurs'); res.json(r.rows); } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); } });
app.post('/api/utilisateurs', authenticateToken, isAdmin, async (req, res) => {
  const { name, password, role } = req.body;
  try { const hashed = await require('bcryptjs').hash(password, 10); const r = await pool.query('INSERT INTO utilisateurs (name,password,role) VALUES ($1,$2,$3) RETURNING *', [name,hashed, role]); await logAction(req.user, 'Creation Personnel', `Nom: ${name}`); res.json(r.rows[0]); }
  catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
});
app.delete('/api/utilisateurs/:id', authenticateToken, isAdmin, async (req, res) => { try { await pool.query('DELETE FROM utilisateurs WHERE id=$1', [req.params.id]); await logAction(req.user, 'Suppression Personnel', `ID: ${req.params.id}`); res.json({ success: true }); } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); } });

app.get('/api/livreurs', authenticateToken, isAdmin, async (req, res) => {
  try { const r = await pool.query(`SELECT u.id, u.name, u.role, (SELECT COUNT(c.id) FROM commandes c WHERE c.livreur_id = u.id AND c.statut = 'livre') as total_livraisons, COALESCE((SELECT SUM(c.total) FROM commandes c WHERE c.livreur_id = u.id AND c.statut = 'livre'), 0) as total_ca FROM utilisateurs u WHERE u.role = 'livreur'`); res.json(r.rows); }
  catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// --- ZONES ---
app.get('/api/zones', async (req, res) => { try { const r = await pool.query('SELECT * FROM zones ORDER BY nom ASC'); res.json(r.rows); } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); } });
app.post('/api/zones', authenticateToken, isAdmin, async (req, res) => { const { nom, lat, lng, rayon, min_commande } = req.body; try { const r = await pool.query('INSERT INTO zones (nom,lat,lng,rayon,min_commande) VALUES ($1,$2,$3,$4,$5) RETURNING *', [nom, lat, lng, rayon, min_commande]); await logAction(req.user, 'Creation Zone', nom); res.json(r.rows[0]); } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); } });
app.put('/api/zones/:id', authenticateToken, isAdmin, async (req, res) => { const { nom, lat, lng, rayon, min_commande } = req.body; try { await pool.query('UPDATE zones SET nom=$1, lat=$2, lng=$3, rayon=$4, min_commande=$5 WHERE id=$6', [nom, lat, lng, rayon, min_commande, req.params.id]); await logAction(req.user, 'Modification Zone', nom); res.json({ success: true }); } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); } });
app.delete('/api/zones/:id', authenticateToken, isAdmin, async (req, res) => { try { await pool.query('DELETE FROM zones WHERE id=$1', [req.params.id]); await logAction(req.user, 'Suppression Zone', `ID: ${req.params.id}`); res.json({ success: true }); } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); } });

// --- CATALOGUE ---
app.get('/api/catalogue', async (req, res) => {
  try { const [cats, savs] = await Promise.all([ pool.query('SELECT * FROM categories ORDER BY nom ASC'), pool.query('SELECT * FROM saveurs ORDER BY nom ASC') ]); res.json({ categories: cats.rows, saveurs: savs.rows }); }
  catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
});
app.get('/api/categories', authenticateToken, isAdmin, async (req, res) => { try { const r = await pool.query('SELECT * FROM categories ORDER BY nom ASC'); res.json(r.rows); } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); } });
app.post('/api/categories', authenticateToken, isAdmin, async (req, res) => { const { nom, image_url, prix_unite, prix_lot_5, prix_lot_10 } = req.body; try { const r = await pool.query('INSERT INTO categories (nom,image_url,prix_unite,prix_lot_5,prix_lot_10) VALUES ($1,$2,$3,$4,$5) RETURNING *', [nom, image_url || null, prix_unite, prix_lot_5, prix_lot_10]); await logAction(req.user, 'Creation Categorie', nom); res.json(r.rows[0]); } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); } });
app.put('/api/categories/:id', authenticateToken, isAdmin, async (req, res) => { const { nom, image_url, prix_unite,prix_lot_5, prix_lot_10 } = req.body; try { await pool.query('UPDATE categories SET nom=$1, image_url=$2, prix_unite=$3, prix_lot_5=$4, prix_lot_10=$5 WHERE id=$6', [nom, image_url || null, prix_unite, prix_lot_5, prix_lot_10, req.params.id]); await logAction(req.user, 'Modification Categorie', nom); res.json({ success: true }); } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); } });
app.delete('/api/categories/:id', authenticateToken, isAdmin, async (req, res) => { try { await pool.query('DELETE FROM categories WHERE id=$1', [req.params.id]); await logAction(req.user, 'Suppression Categorie', `ID: ${req.params.id}`); res.json({ success: true }); } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); } });

app.get('/api/saveurs', authenticateToken, isAdmin, async (req, res) => { try { const r = await pool.query('SELECT * FROM saveurs ORDER BY nom ASC'); res.json(r.rows); } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); } });
app.post('/api/saveurs', authenticateToken, isAdmin, async (req, res) => { const { categorie_id, nom, stock } = req.body; try { const r = await pool.query('INSERT INTO saveurs (categorie_id,nom,stock) VALUES ($1,$2,$3) RETURNING *', [categorie_id, nom, stock]); await logAction(req.user, 'Creation Saveur', nom); res.json(r.rows[0]); } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); } });
app.put('/api/saveurs/:id', authenticateToken, isAdmin, async (req, res) => { const { categorie_id, nom, stock } = req.body; try { await pool.query('UPDATE saveurs SET categorie_id=$1, nom=$2, stock=$3 WHERE id=$4', [categorie_id, nom, stock, req.params.id]); await logAction(req.user, 'Modification Saveur', nom); res.json({ success: true }); } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); } });
app.delete('/api/saveurs/:id', authenticateToken, isAdmin, async (req, res) => { try { await pool.query('DELETE FROM saveurs WHERE id=$1', [req.params.id]); await logAction(req.user, 'Suppression Saveur', `ID: ${req.params.id}`); res.json({ success: true }); } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); } });

// --- VENTES & EXPORTS ---
app.get('/api/ventes', authenticateToken, isAdmin, async (req, res) => {
  try {
    const r = await pool.query(`SELECT c.id, c.client_id, c.total as prix_vente_total, c.date_commande as date_vente, c.valide_par, c.promo_code, COALESCE(NULLIF(cl.nom, ''), 'Client ' || cl.telephone) as client_nom, (SELECT json_agg(json_build_object('nom', ci.saveur_nom, 'qte', ci.quantite, 'prix', ci.prix)) FROM commande_items ci WHERE ci.commande_id = c.id) as items FROM commandes c LEFT JOIN clients cl ON c.client_id = cl.id WHERE LOWER(c.statut) LIKE '%livr%' ORDER BY c.date_commande DESC`);
    let totalCA = 0; r.rows.forEach(v => { totalCA += parseFloat(v.prix_vente_total); });
    res.json({ ventes: r.rows, totalCA: totalCA });
  } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
});

app.get('/api/admin/export-commandes', authenticateToken, isAdmin, async (req, res) => {
  try { const commandes = await pool.query(`SELECT c.*, COALESCE(NULLIF(cl.nom, ''), 'Client ' || cl.telephone) as client_nom, cl.telephone, cl.adresse FROM commandes c LEFT JOIN clients cl ON c.client_id = cl.id`); const items = await pool.query('SELECT * FROM commande_items'); const exportData = { export_date: new Date().toISOString(), commandes: commandes.rows, items: items.rows }; await logAction(req.user, 'Exportation Donnees', 'Export JSON commandes'); res.setHeader('Content-Type', 'application/json'); res.setHeader('Content-Disposition', 'attachment; filename="puffzone_export_commandes.json"'); res.json(exportData); } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
});

app.get('/api/admin/export-logs', authenticateToken, isAdmin, async (req, res) => {
  try { const r = await pool.query('SELECT * FROM logs_activite ORDER BY date_log DESC'); res.setHeader('Content-Type', 'application/json'); res.setHeader('Content-Disposition', 'attachment; filename="puffzone_logs.json"'); res.json(r.rows); } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
});

app.get('/api/admin/export-security', authenticateToken, isAdmin, async (req, res) => {
  try { const failed = await pool.query("SELECT * FROM logs_activite WHERE action LIKE '%Connexion%' AND details LIKE '%Echouee%' ORDER BY date_log DESC"); res.setHeader('Content-Type', 'application/json'); res.setHeader('Content-Disposition', 'attachment; filename="puffzone_securite.json"'); res.json({ tentativesEchouees: failed.rows }); } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
});

app.post('/api/admin/reset-commandes', authenticateToken, isAdmin, async (req, res) => {
  try { const commandes = await pool.query('SELECT * FROM commandes'); const items = await pool.query('SELECT * FROM commande_items'); const backupData = { date_backup: new Date().toISOString(), commandes: commandes.rows, items: items.rows }; await pool.query('INSERT INTO backup_commandes (data) VALUES ($1)', [backupData]); await pool.query('TRUNCATE TABLE commande_items, commandes RESTART IDENTITY CASCADE'); await logAction(req.user, 'Reset Commandes', `Sauvegarde effectuee (${commandes.rows.length} commandes)`); res.json({ success: true, message: "Commandes sauvegardées puis réinitialisées." }); } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// --- SECURITE & URGENCE ---
app.get('/api/security/analyse', authenticateToken, isAdmin, async (req, res) => {
  try {
    const failedLogins = await pool.query("SELECT * FROM logs_activite WHERE action LIKE '%Connexion%' AND details LIKE '%Echouee%' ORDER BY date_log DESC LIMIT 20");
    const attackCount = await pool.query("SELECT COUNT(*) FROM logs_activite WHERE action LIKE '%Connexion%' AND details LIKE '%Echouee%' OR action LIKE '%Intrusion%'");
    res.json({ failedLogins: failedLogins.rows, totalAttacks: parseInt(attackCount.rows[0].count), isLockdown });
  } catch (e) { res.status(500).json({ error: 'Erreur analyse' }); }
});

app.post('/api/admin/security/toggle-lockdown', authenticateToken, isAdmin, async (req, res) => {
  isLockdown = !isLockdown;
  await logAction(req.user, 'Protocole Lockdown', `Le mode urgence a été ${isLockdown ? 'ACTIVÉ' : 'DÉSACTIVÉ'}`);
  res.json({ success: true, lockdown: isLockdown });
});

app.post('/api/admin/security/simulate-attack', authenticateToken, isAdmin, async (req, res) => {
  await logAction({name: 'PIRATE', role: 'inconnu'}, 'Tentative Intrusion', 'Injection SQL détectée (SIMULATION)');
  res.json({ success: true, message: 'Simulation enregistrée.' });
});

app.post('/api/admin/security/backup-wipe', authenticateToken, isAdmin, async (req, res) => {
  try {
    const backupData = { date: new Date(), clients: (await pool.query('SELECT * FROM clients')).rows, commandes: (await pool.query('SELECT * FROM commandes')).rows, items: (await pool.query('SELECT * FROM commande_items')).rows, produits: (await pool.query('SELECT * FROM saveurs')).rows };
    await pool.query('INSERT INTO backup_commandes (data) VALUES ($1)', [backupData]);
    await pool.query('TRUNCATE TABLE commande_items, commandes, clients, saveurs RESTART IDENTITY CASCADE');
    await logAction(req.user, 'Protocole Zero-Day', 'Backup complet + Wipe BDD');
    res.json({ success: true, message: 'Sauvegarde effectuée et base nettoyée.' });
  } catch (e) { res.status(500).json({ error: 'Erreur lors du wipe.' }); }
});

// --- LOGS ---
app.get('/api/logs', authenticateToken, isAdmin, async (req, res) => {
  try { const r = await pool.query('SELECT id, date_log, user_name, user_role, action, details FROM logs_activite ORDER BY date_log DESC LIMIT 200'); res.json(r.rows); } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// --- FALLBACK ---
app.get('*', (req, res) => { res.sendFile(path.join(__dirname, 'public', 'index.html')); });

app.listen(PORT, () => console.log(`🚀 Serveur PUFF ZONE démarré sur le port ${PORT}`));