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
    `);
    await pool.query('ALTER TABLE commandes ADD COLUMN IF NOT EXISTS livreur_id INTEGER REFERENCES utilisateurs(id);');
    await pool.query('ALTER TABLE commande_items ADD COLUMN IF NOT EXISTS prix_achat DECIMAL(10,2) DEFAULT 0;');
    console.log("ÃƒÆ’Ã‚Â¢Ãƒâ€¦Ã¢â‚¬Å“ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ Base de donnÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â©es vÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â©rifiÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â©e et ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â  jour !");
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
    if (r.rows.length === 0) return res.status(404).json({ success: false, error: 'NumÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â©ro non reconnu' });
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

// --- MES COMMANDES (CÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â´tÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â© Client - Public) ---
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

// --- ADMIN : LISTE DES CLIENTS ---
app.get('/api/clients', authenticateToken, isAdmin, async (req, res) => {
  try { const r = await pool.query('SELECT * FROM clients ORDER BY created_at DESC'); res.json(r.rows); } 
  catch (e) { res.status(500).json({ error: e.message }); }
});

// --- COMMANDES (Admin & Public) ---
app.post('/api/commandes', async (req, res) => {
  const { client_id, cart, total } = req.body;
  try {
    const cmd = await pool.query('INSERT INTO commandes (client_id, total) VALUES ($1,$2) RETURNING id', [client_id, total]);
    const cmdId = cmd.rows[0].id;
    for (const item of cart) {
      await pool.query('INSERT INTO commande_items (commande_id, saveur_nom, quantite, prix, prix_achat) VALUES ($1,$2,$3,$4,$5)', [cmdId, item.nom, item.qty, item.prix, item.prix_achat || 0]);
      await pool.query('UPDATE saveurs SET stock = stock - $1 WHERE nom = $2', [item.qty, item.nom]);
    }
    res.json({ success: true, commande_id: cmdId });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/commandes', authenticateToken, isAdmin, async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT c.*, COALESCE(NULLIF(cl.nom, ''), 'Client ' || cl.telephone) as client_nom, cl.telephone, cl.whatsapp
      FROM commandes c LEFT JOIN clients cl ON c.client_id = cl.id
      ORDER BY c.date_commande DESC
    `);
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/commandes/:id/statut', authenticateToken, async (req, res) => {
  const { statut } = req.body;
  try { await pool.query('UPDATE commandes SET statut=$1 WHERE id=$2', [statut, req.params.id]); res.json({ success: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/commandes/:id/assign', authenticateToken, isAdmin, async (req, res) => {
  const { livreur_id } = req.body;
  try {
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

app.get('/api/stats', authenticateToken, isAdmin, async (req, res) => {
  try {
    const top = await pool.query(`SELECT saveur_nom, SUM(quantite) as total_qte FROM commande_items GROUP BY saveur_nom ORDER BY total_qte DESC LIMIT 5`);
    res.json({ topSaveurs: top.rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// --- UTILISATEURS ---
app.get('/api/utilisateurs', authenticateToken, isAdmin, async (req, res) => { try { const r = await pool.query('SELECT id,name,role FROM utilisateurs'); res.json(r.rows); } catch (e) { res.status(500).json({ error: e.message }); } });
app.post('/api/utilisateurs', authenticateToken, isAdmin, async (req, res) => { 
  const { name, password, role } = req.body; 
  try { 
    const hashed = await require('bcryptjs').hash(password, 10);
    const r = await pool.query('INSERT INTO utilisateurs (name,password,role) VALUES ($1,$2,$3) RETURNING *', [name, hashed, role]); 
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
      FROM utilisateurs u
      WHERE u.role = 'livreur'
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
app.get('/api/zones', authenticateToken, async (req, res) => { try { const r = await pool.query('SELECT * FROM zones ORDER BY nom ASC'); res.json(r.rows); } catch (e) { res.status(500).json({ error: e.message }); } });
app.post('/api/zones', authenticateToken, isAdmin, async (req, res) => { const { nom, lat, lng, rayon, min_commande } = req.body; try { const r = await pool.query('INSERT INTO zones (nom,lat,lng,rayon,min_commande) VALUES ($1,$2,$3,$4,$5) RETURNING *', [nom, lat, lng, rayon, min_commande]); res.json(r.rows[0]); } catch (e) { res.status(500).json({ error: e.message }); } });
app.delete('/api/zones/:id', authenticateToken, isAdmin, async (req, res) => { try { await pool.query('DELETE FROM zones WHERE id=$1', [req.params.id]); res.json({ success: true }); } catch (e) { res.status(500).json({ error: e.message }); } });

// --- CATEGORIES & SAVEURS ---
app.get('/api/catalogue', async (req, res) => {
  try {
    const [cats, savs] = await Promise.all([
      pool.query('SELECT * FROM categories ORDER BY nom ASC'),
      pool.query('SELECT * FROM saveurs ORDER BY nom ASC')
    ]);
    res.json({ categories: cats.rows, saveurs: savs.rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/categories', authenticateToken, isAdmin, async (req, res) => { try { const r = await pool.query('SELECT * FROM categories ORDER BY nom ASC'); res.json(r.rows); } catch (e) { res.status(500).json({ error: e.message }); } });
app.post('/api/categories', authenticateToken, isAdmin, async (req, res) => { const { nom, image_url, prix_unite, prix_lot_5, prix_lot_10 } = req.body; try { const r = await pool.query('INSERT INTO categories (nom,image_url,prix_unite,prix_lot_5,prix_lot_10) VALUES ($1,$2,$3,$4,$5) RETURNING *', [nom, image_url || null, prix_unite, prix_lot_5, prix_lot_10]); res.json(r.rows[0]); } catch (e) { res.status(500).json({ error: e.message }); } });
app.delete('/api/categories/:id', authenticateToken, isAdmin, async (req, res) => { try { await pool.query('DELETE FROM categories WHERE id=$1', [req.params.id]); res.json({ success: true }); } catch (e) { res.status(500).json({ error: e.message }); } });

app.get('/api/saveurs', authenticateToken, isAdmin, async (req, res) => { try { const r = await pool.query('SELECT * FROM saveurs ORDER BY nom ASC'); res.json(r.rows); } catch (e) { res.status(500).json({ error: e.message }); } });
app.post('/api/saveurs', authenticateToken, isAdmin, async (req, res) => { const { categorie_id, nom, stock, prix_achat } = req.body; try { const r = await pool.query('INSERT INTO saveurs (categorie_id,nom,stock,prix_achat) VALUES ($1,$2,$3,$4) RETURNING *', [categorie_id, nom, stock, prix_achat]); res.json(r.rows[0]); } catch (e) { res.status(500).json({ error: e.message }); } });
app.delete('/api/saveurs/:id', authenticateToken, isAdmin, async (req, res) => { try { await pool.query('DELETE FROM saveurs WHERE id=$1', [req.params.id]); res.json({ success: true }); } catch (e) { res.status(500).json({ error: e.message }); } });

// --- VENTES ---
app.get('/api/ventes', authenticateToken, isAdmin, async (req, res) => { 
  try { 
    const r = await pool.query(`
      SELECT c.id, c.client_id, c.total as prix_vente_total, c.date_commande as date_vente,
             COALESCE((SELECT SUM(prix_achat * quantite) FROM commande_items WHERE commande_id = c.id), 0) as prix_achat_total,
             COALESCE(NULLIF(cl.nom, ''), 'Client ' || cl.telephone) as client_nom
      FROM commandes c 
      LEFT JOIN clients cl ON c.client_id = cl.id
      WHERE LOWER(c.statut) LIKE '%livr%'
      ORDER BY c.date_commande DESC
    `); 
    let totalCA = 0;
    let totalMarge = 0;
    r.rows.forEach(v => {
      totalCA += parseFloat(v.prix_vente_total);
      totalMarge += (parseFloat(v.prix_vente_total) - parseFloat(v.prix_achat_total));
    });
    res.json({ ventes: r.rows, totalCA: totalCA, totalMarge: totalMarge }); 
  } catch (e) { res.status(500).json({ error: e.message }); } 
});


// --- NOUVELLES ROUTES POUR STATS & HISTORIQUE LIVREUR ---
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

// --- ROUTE RESET COMMANDES (Admin) ---
app.post('/api/admin/reset-commandes', authenticateToken, isAdmin, async (req, res) => {
  try {
    await pool.query('TRUNCATE TABLE commande_items, commandes RESTART IDENTITY CASCADE');
    res.json({ success: true, message: "Commandes et Chiffre d'Affaires rÃ©initialisÃ©s." });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// --- FALLBACK SPA ---
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => console.log(`ÃƒÆ’Ã‚Â°Ãƒâ€¦Ã‚Â¸Ãƒâ€¦Ã‚Â¡ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ Serveur PUFF ZONE dÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â©marrÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â© sur le port ${PORT}`));