require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { Pool } = require('pg');
const { authenticateToken, isAdmin, checkPassword, generateToken } = require('./auth');

const app = express();
const PORT = process.env.PORT || 5000;
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const initDB = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS utilisateurs (
        id SERIAL PRIMARY KEY, name VARCHAR(100) UNIQUE NOT NULL, password VARCHAR(255) NOT NULL, role VARCHAR(50) NOT NULL, see_client_phone BOOLEAN DEFAULT true, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS clients (
        id SERIAL PRIMARY KEY, telephone VARCHAR(50) UNIQUE NOT NULL, nom VARCHAR(100), adresse TEXT, whatsapp VARCHAR(50), created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS commandes (
        id SERIAL PRIMARY KEY, client_id INTEGER REFERENCES clients(id), total DECIMAL(10,2), statut VARCHAR(50) DEFAULT 'en_attente', date_commande TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS commande_items (
        id SERIAL PRIMARY KEY, commande_id INTEGER REFERENCES commandes(id) ON DELETE CASCADE, saveur_nom VARCHAR(100), quantite INTEGER, prix DECIMAL(10,2)
      );
      CREATE TABLE IF NOT EXISTS codes_promo (
        id SERIAL PRIMARY KEY, code VARCHAR(50) UNIQUE NOT NULL, pourcentage INTEGER NOT NULL, actif BOOLEAN DEFAULT true, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await pool.query('ALTER TABLE commandes ADD COLUMN IF NOT EXISTS livreur_id INTEGER REFERENCES utilisateurs(id);');
    await pool.query('ALTER TABLE commandes ADD COLUMN IF NOT EXISTS valide_par VARCHAR(100);');
    await pool.query('ALTER TABLE commande_items ADD COLUMN IF NOT EXISTS prix_achat DECIMAL(10,2) DEFAULT 0;');
    await pool.query('ALTER TABLE zones ADD COLUMN IF NOT EXISTS frais_livraison DECIMAL(10,2) DEFAULT 0;');
    console.log("Ã¢Å“â€¦ Base de donnÃƒÂ©es vÃƒÂ©rifiÃƒÂ©e et ÃƒÂ  jour !");
  } catch (e) { console.error("Erreur init DB:", e); }
};
initDB();

app.get('/api/health', async (req, res) => {
  try { await pool.query('SELECT 1'); res.json({ status: 'ok', db: 'connected' }); }
  catch (e) { res.status(500).json({ status: 'error', error: e.message }); }
});

// --- CLIENTS (Public) ---
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
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/clients/login', async (req, res) => {
  const { telephone } = req.body;
  try {
    const r = await pool.query('SELECT * FROM clients WHERE telephone = $1', [telephone]);
    if (r.rows.length === 0) return res.status(404).json({ success: false, error: 'NumÃƒÂ©ro non reconnu' });
    res.json({ success: true, client: r.rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/clients/:id', async (req, res) => {
  const { nom, adresse, whatsapp } = req.body;
  try {
    const r = await pool.query('UPDATE clients SET nom=$1, adresse=$2, whatsapp=$3 WHERE id=$4 RETURNING *', [nom, adresse, whatsapp, req.params.id]);
    res.json({ success: true, client: r.rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/clients/:id/commandes', async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT c.*,
             (SELECT json_agg(json_build_object('saveur', ci.saveur_nom, 'qte', ci.quantite, 'prix', ci.prix))
              FROM commande_items ci WHERE ci.commande_id = c.id) as items
      FROM commandes c
      WHERE c.client_id = $1
      ORDER BY c.date_commande DESC
    `, [req.params.id]);
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/clients', authenticateToken, isAdmin, async (req, res) => {
  try { const r = await pool.query('SELECT * FROM clients ORDER BY created_at DESC'); res.json(r.rows); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// --- CODES PROMO ---
app.post('/api/promo/check', async (req, res) => {
  const { code } = req.body;
  try {
    const r = await pool.query('SELECT * FROM codes_promo WHERE UPPER(code) = UPPER($1) AND actif = true', [code]);
    if (r.rows.length === 0) return res.status(404).json({ success: false, error: 'Code invalide ou expirÃƒÂ©' });
    res.json({ success: true, pourcentage: r.rows[0].pourcentage });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/promo', authenticateToken, isAdmin, async (req, res) => {
  try { const r = await pool.query('SELECT * FROM codes_promo ORDER BY created_at DESC'); res.json(r.rows); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/promo', authenticateToken, isAdmin, async (req, res) => {
  const { code, pourcentage } = req.body;
  try {
    const r = await pool.query('INSERT INTO codes_promo (code, pourcentage) VALUES ($1, $2) RETURNING *', [code.toUpperCase(), pourcentage]);
    res.json(r.rows[0]);
  } catch (e) { res.status(500).json({ error: "Ce code existe dÃƒÂ©jÃƒÂ  !" }); }
});

app.delete('/api/promo/:id', authenticateToken, isAdmin, async (req, res) => {
  try { await pool.query('DELETE FROM codes_promo WHERE id=$1', [req.params.id]); res.json({ success: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// --- COMMANDES ---
app.post('/api/commandes', async (req, res) => {
  const { client_id, cart, total, promo_code, valide_par } = req.body;
  try {
    // 1. VÃƒâ€°RIFICATION DU STOCK
    for (const item of cart) {
      const stockCheck = await pool.query('SELECT stock FROM saveurs WHERE nom = $1', [item.nom]);
      if (stockCheck.rows.length === 0) return res.status(400).json({ error: `La saveur "${item.nom}" n'existe plus.` });
      if (item.qty > stockCheck.rows[0].stock) {
        return res.status(400).json({ error: `Stock insuffisant pour "${item.nom}". Dispo : ${stockCheck.rows[0].stock}` });
      }
    }

    // 2. APPLICATION PROMO
    let finalTotal = parseFloat(total);
    if (promo_code) {
      const promo = await pool.query('SELECT * FROM codes_promo WHERE UPPER(code) = UPPER($1) AND actif = true', [promo_code]);
      if (promo.rows.length > 0) {
        const pct = promo.rows[0].pourcentage;
        finalTotal = finalTotal - (finalTotal * (pct / 100));
      }
    }

    // 3. INSERTION (Ajout de valide_par)
    const cmd = await pool.query('INSERT INTO commandes (client_id, total, valide_par) VALUES ($1,$2,$3) RETURNING id', [client_id, finalTotal, valide_par || 'Client']);
    const cmdId = cmd.rows[0].id;

    for (const item of cart) {
      await pool.query('INSERT INTO commande_items (commande_id, saveur_nom, quantite, prix, prix_achat) VALUES ($1,$2,$3,$4,$5)', [cmdId, item.nom, item.qty, item.prix, item.prix_achat || 0]);
      await pool.query('UPDATE saveurs SET stock = stock - $1 WHERE nom = $2', [item.qty, item.nom]);
    }
    res.json({ success: true, commande_id: cmdId, finalTotal });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/commandes', authenticateToken, isAdmin, async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT c.*, COALESCE(NULLIF(cl.nom, ''), 'Client ' || cl.telephone) as client_nom, cl.telephone, cl.whatsapp, cl.adresse
      FROM commandes c LEFT JOIN clients cl ON c.client_id = cl.id
      ORDER BY c.date_commande DESC
    `);
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/commandes/:id/statut', authenticateToken, async (req, res) => {
  const { statut } = req.body;
  try {
    const check = await pool.query('SELECT statut FROM commandes WHERE id=$1', [req.params.id]);
    if (check.rows.length > 0 && check.rows[0].statut === 'livre') {
      return res.status(403).json({ error: 'Action interdite : cette commande est dÃƒÂ©jÃƒÂ  livrÃƒÂ©e.' });
    }
    await pool.query('UPDATE commandes SET statut=$1 WHERE id=$2', [statut, req.params.id]);
    res.json({ success: true });
  }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/commandes/:id/assign', authenticateToken, isAdmin, async (req, res) => {
  const { livreur_id } = req.body;
  try {
    const check = await pool.query('SELECT statut FROM commandes WHERE id=$1', [req.params.id]);
    if (check.rows.length > 0 && check.rows[0].statut === 'livre') {
      return res.status(403).json({ error: 'Action interdite : cette commande est dÃƒÂ©jÃƒÂ  livrÃƒÂ©e.' });
    }
    await pool.query('UPDATE commandes SET livreur_id = $1 WHERE id = $2', [livreur_id, req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/commandes/livreur/:id', authenticateToken, async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT c.*, COALESCE(NULLIF(cl.nom, ''), 'Client ' || cl.telephone) as client_nom, cl.telephone, cl.whatsapp, cl.adresse
      FROM commandes c LEFT JOIN clients cl ON c.client_id = cl.id
      WHERE c.livreur_id = $1 AND c.statut != 'livre'
      ORDER BY c.date_commande DESC
    `, [req.params.id]);
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/commandes/livreur/:id/historique', authenticateToken, async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT c.id, c.total, c.date_commande, COALESCE(NULLIF(cl.nom, ''), 'Client ' || cl.telephone) as client_nom
      FROM commandes c LEFT JOIN clients cl ON c.client_id = cl.id
      WHERE c.livreur_id = $1 AND c.statut = 'livre'
      ORDER BY c.date_commande DESC
    `, [req.params.id]);
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/livreur/:id/stats', authenticateToken, async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT COUNT(id) as total_livraisons, COALESCE(SUM(total), 0) as total_ca
      FROM commandes WHERE livreur_id = $1 AND statut = 'livre'
    `, [req.params.id]);
    res.json(r.rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// --- STATS GENERALES ---
app.get('/api/stats', authenticateToken, isAdmin, async (req, res) => {
  try {
    const top = await pool.query(`SELECT saveur_nom, SUM(quantite) as total_qte FROM commande_items GROUP BY saveur_nom ORDER BY total_qte DESC LIMIT 5`);
    const ca7jours = await pool.query(`
      SELECT TO_CHAR(date_commande, 'DD/MM') as jour, SUM(total) as ca
      FROM commandes
      WHERE statut = 'livre' AND date_commande >= NOW() - INTERVAL '7 days'
      GROUP BY TO_CHAR(date_commande, 'DD/MM'), DATE_TRUNC('day', date_commande)
      ORDER BY DATE_TRUNC('day', date_commande) ASC
    `);
    res.json({ topSaveurs: top.rows, ca7jours: ca7jours.rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// --- UTILISATEURS ---
app.get('/api/utilisateurs', authenticateToken, isAdmin, async (req, res) => { try { const r = await pool.query('SELECT id,name,role FROM utilisateurs'); res.json(r.rows); } catch (e) { res.status(500).json({ error: e.message }); } });
app.post('/api/utilisateurs', authenticateToken, isAdmin, async (req, res) => {
  const { name, password, role } = req.body;
  try {
    const hashed = await require('bcryptjs').hash(password, 10);
    const r = await pool.query('INSERT INTO utilisateurs (name,password,role) VALUES ($1,$2,$3) RETURNING *', [name,hashed, role]);
    res.json(r.rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.delete('/api/utilisateurs/:id', authenticateToken, isAdmin, async (req, res) => { try { await pool.query('DELETE FROM utilisateurs WHERE id=$1', [req.params.id]); res.json({ success: true }); } catch (e) { res.status(500).json({ error: e.message }); } });

// --- LOGIN ADMIN ---
app.post('/api/login', async (req, res) => {
  const { name, password } = req.body;
  try {
    const r = await pool.query('SELECT * FROM utilisateurs WHERE name=$1', [name]);
    if (r.rows.length === 0) return res.status(401).json({ error: 'Identifiants incorrects' });
    const user = r.rows[0];
    const validPassword = await checkPassword(password, user.password);
    if (!validPassword) return res.status(401).json({ error: 'Identifiants incorrects' });
    const token = generateToken(user);
    res.json({ success: true, token, user: { id: user.id, name: user.name, role: user.role } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// --- LIVREURS ---
app.get('/api/livreurs', authenticateToken, isAdmin, async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT u.id, u.name, u.role,
             (SELECT COUNT(c.id) FROM commandes c WHERE c.livreur_id = u.id AND c.statut = 'livre') as total_livraisons,
             COALESCE((SELECT SUM(c.total) FROM commandes c WHERE c.livreur_id = u.id AND c.statut = 'livre'), 0) as total_ca
      FROM utilisateurs u WHERE u.role = 'livreur'
    `);
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/login-livreur', async (req, res) => {
  const { name, password } = req.body;
  try {
    const r = await pool.query("SELECT * FROM utilisateurs WHERE name=$1 AND role='livreur'", [name]);
    if (r.rows.length === 0) return res.status(401).json({ error: 'Identifiants incorrects' });
    const livreur = r.rows[0];
    const validPassword = await checkPassword(password, livreur.password);
    if (!validPassword) return res.status(401).json({ error: 'Identifiants incorrects' });
    const token = generateToken(livreur);
    res.json({ success: true, token, livreur: { id: livreur.id, name: livreur.name, role: livreur.role } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// --- ZONES ---
app.get('/api/zones', async (req, res) => { try { const r = await pool.query('SELECT * FROM zones ORDER BY nom ASC'); res.json(r.rows); } catch (e) { res.status(500).json({ error: e.message }); } });
app.post('/api/zones', authenticateToken, isAdmin, async (req, res) => { const { nom, lat, lng, rayon, min_commande } = req.body; try { const r = await pool.query('INSERT INTO zones (nom,lat,lng,rayon,min_commande) VALUES ($1,$2,$3,$4,$5) RETURNING *', [nom, lat, lng, rayon, min_commande]); res.json(r.rows[0]); } catch (e) { res.status(500).json({ error:e.message }); } });
app.delete('/api/zones/:id', authenticateToken, isAdmin, async (req, res) => { try { await pool.query('DELETE FROM zones WHERE id=$1', [req.params.id]); res.json({ success: true }); } catch (e) { res.status(500).json({ error: e.message }); } });

// --- CATEGORIES & SAVEURS ---
app.get('/api/catalogue', async (req, res) => {
  try {
    const [cats, savs] = await Promise.all([ pool.query('SELECT * FROM categories ORDER BY nom ASC'), pool.query('SELECT * FROM saveurs ORDER BY nom ASC') ]);
    res.json({ categories: cats.rows, saveurs: savs.rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/categories', authenticateToken, isAdmin, async (req, res) => { try { const r = await pool.query('SELECT * FROM categories ORDER BY nom ASC'); res.json(r.rows); } catch (e) { res.status(500).json({ error: e.message }); } });
app.post('/api/categories', authenticateToken, isAdmin, async (req, res) => { const { nom, image_url, prix_unite, prix_lot_5, prix_lot_10 } = req.body; try { const r = await pool.query('INSERT INTO categories (nom,image_url,prix_unite,prix_lot_5,prix_lot_10) VALUES ($1,$2,$3,$4,$5) RETURNING *', [nom, image_url || null, prix_unite, prix_lot_5, prix_lot_10]); res.json(r.rows[0]); } catch (e) { res.status(500).json({ error: e.message }); } });
app.put('/api/categories/:id', authenticateToken, isAdmin, async (req, res) => { const { nom, image_url, prix_unite,prix_lot_5, prix_lot_10 } = req.body; try { await pool.query('UPDATE categories SET nom=$1, image_url=$2, prix_unite=$3, prix_lot_5=$4, prix_lot_10=$5 WHERE id=$6', [nom, image_url || null, prix_unite, prix_lot_5, prix_lot_10, req.params.id]); res.json({ success: true }); } catch (e) { res.status(500).json({ error: e.message }); } });
app.delete('/api/categories/:id', authenticateToken, isAdmin, async (req, res) => { try { await pool.query('DELETE FROM categories WHERE id=$1', [req.params.id]); res.json({ success: true }); } catch (e) { res.status(500).json({ error: e.message }); } });

app.get('/api/saveurs', authenticateToken, isAdmin, async (req, res) => { try { const r = await pool.query('SELECT * FROM saveurs ORDER BY nom ASC'); res.json(r.rows); } catch (e) { res.status(500).json({ error: e.message }); } });
app.post('/api/saveurs', authenticateToken, isAdmin, async (req, res) => { const { categorie_id, nom, stock, prix_achat } = req.body; try { const r = await pool.query('INSERT INTO saveurs (categorie_id,nom,stock,prix_achat) VALUES ($1,$2,$3,$4) RETURNING *', [categorie_id, nom, stock, prix_achat]); res.json(r.rows[0]); } catch (e) { res.status(500).json({ error: e.message }); } });
app.put('/api/saveurs/:id', authenticateToken, isAdmin, async (req, res) => { const { categorie_id, nom, stock, prix_achat } = req.body; try { await pool.query('UPDATE saveurs SET categorie_id=$1, nom=$2, stock=$3, prix_achat=$4 WHERE id=$5', [categorie_id, nom, stock, prix_achat, req.params.id]); res.json({ success: true }); } catch (e) { res.status(500).json({ error: e.message }); } });
app.delete('/api/saveurs/:id', authenticateToken, isAdmin, async (req, res) => { try { await pool.query('DELETE FROM saveurs WHERE id=$1', [req.params.id]); res.json({ success: true }); } catch (e) { res.status(500).json({ error: e.message }); } });

// --- VENTES & RESET ---
app.get('/api/ventes', authenticateToken, isAdmin, async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT c.id, c.client_id, c.total as prix_vente_total, c.date_commande as date_vente, c.valide_par,
             COALESCE((SELECT SUM(prix_achat * quantite) FROM commande_items WHERE commande_id = c.id), 0) as prix_achat_total,
             COALESCE(NULLIF(cl.nom, ''), 'Client ' || cl.telephone) as client_nom,
             (SELECT json_agg(json_build_object('nom', ci.saveur_nom, 'qte', ci.quantite, 'prix', ci.prix, 'prix_achat', ci.prix_achat)) 
              FROM commande_items ci WHERE ci.commande_id = c.id) as items
      FROM commandes c LEFT JOIN clients cl ON c.client_id = cl.id
      WHERE LOWER(c.statut) LIKE '%livr%' ORDER BY c.date_commande DESC
    `);
    let totalCA = 0; let totalMarge = 0;
    r.rows.forEach(v => { totalCA += parseFloat(v.prix_vente_total); totalMarge += (parseFloat(v.prix_vente_total) - parseFloat(v.prix_achat_total)); });
    res.json({ ventes: r.rows, totalCA: totalCA, totalMarge: totalMarge });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/admin/reset-commandes', authenticateToken, isAdmin, async (req, res) => {
  try {
    await pool.query('TRUNCATE TABLE commande_items, commandes RESTART IDENTITY CASCADE');
    res.json({ success: true, message: "Commandes et Chiffre d'Affaires rÃƒÂ©initialisÃƒÂ©s." });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// --- FALLBACK SPA ---
app.get('*', (req, res) => { res.sendFile(path.join(__dirname, 'public', 'index.html')); });
app.listen(PORT, () => console.log(`Ã°Å¸Å¡â‚¬ Serveur PUFF ZONE dÃƒÂ©marrÃƒÂ© sur le port ${PORT}`));