require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 5000;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

app.use(cors());
app.use(express.json({ limit: '50mb' }));

// --- SERT LES FICHIERS STATIQUES (public/) ---
app.use(express.static(path.join(__dirname, 'public')));

// --- HEALTHCHECK ---
app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', db: 'connected', port: PORT });
  } catch (e) {
    res.status(500).json({ status: 'error', db: 'disconnected', error: e.message });
  }
});

// --- CLIENTS ---
// --- INSCRIPTION CLIENT (Création) ---
app.post('/api/clients/register', async (req, res) => {
  const { telephone, nom, adresse, whatsapp } = req.body;
  try {
    let r = await pool.query('SELECT * FROM clients WHERE telephone = $1', [telephone]);
    if (r.rows.length === 0) {
      r = await pool.query('INSERT INTO clients (telephone, nom, adresse, whatsapp) VALUES ($1,$2,$3,$4) RETURNING *', [telephone, nom, adresse, whatsapp]);
    } else {
      // Si le client existe déjà (mise à jour de ses infos)
      r = await pool.query('UPDATE clients SET nom=$1, adresse=$2, whatsapp=$3 WHERE telephone=$4 RETURNING *', [nom, adresse, whatsapp, telephone]);
    }
    res.json({ success: true, client: r.rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// --- CONNEXION CLIENT (Vérification simple) ---
app.post('/api/clients/login', async (req, res) => {
  const { telephone } = req.body;
  try {
    const r = await pool.query('SELECT * FROM clients WHERE telephone = $1', [telephone]);
    if (r.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Numéro non reconnu' });
    }
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

app.get('/api/clients', async (req, res) => {
  try { const r = await pool.query('SELECT * FROM clients ORDER BY created_at DESC'); res.json(r.rows); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// --- COMMANDES ---
app.post('/api/commandes', async (req, res) => {
  const { client_id, cart, total } = req.body;
  try {
    const cmd = await pool.query('INSERT INTO commandes (client_id, total) VALUES ($1,$2) RETURNING id', [client_id, total]);
    const cmdId = cmd.rows[0].id;
    for (const item of cart) {
      await pool.query('INSERT INTO commande_items (commande_id, saveur_nom, quantite, prix) VALUES ($1,$2,$3,$4)', [cmdId, item.nom, item.qty, item.prix]);
    }
    res.json({ success: true, commande_id: cmdId });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/commandes', async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT c.*, cl.nom as client_nom, cl.telephone, cl.whatsapp
      FROM commandes c LEFT JOIN clients cl ON c.client_id = cl.id
      ORDER BY c.date_commande DESC
    `);
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/commandes/:id/statut', async (req, res) => {
  const { statut } = req.body;
  try { await pool.query('UPDATE commandes SET statut=$1 WHERE id=$2', [statut, req.params.id]); res.json({ success: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// --- STATS ---
app.get('/api/stats', async (req, res) => {
  try {
    const top = await pool.query(`SELECT saveur_nom, SUM(quantite) as total_qte FROM commande_items GROUP BY saveur_nom ORDER BY total_qte DESC LIMIT 5`);
    res.json({ topSaveurs: top.rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// --- UTILISATEURS (STAFF) ---
app.get('/api/utilisateurs', async (req, res) => { try { const r = await pool.query('SELECT id,name,role FROM utilisateurs'); res.json(r.rows); } catch (e) { res.status(500).json({ error: e.message }); } });
app.post('/api/utilisateurs', async (req, res) => { const { name, password, role } = req.body; try { const r = await pool.query('INSERT INTO utilisateurs (name,password,role) VALUES ($1,$2,$3) RETURNING *', [name, password, role]); res.json(r.rows[0]); } catch (e) { res.status(500).json({ error: e.message }); } });
app.delete('/api/utilisateurs/:id', async (req, res) => { try { await pool.query('DELETE FROM utilisateurs WHERE id=$1', [req.params.id]); res.json({ success: true }); } catch (e) { res.status(500).json({ error: e.message }); } });

app.post('/api/login', async (req, res) => {
  const { name, password } = req.body;
  try { const r = await pool.query('SELECT * FROM utilisateurs WHERE name=$1 AND password=$2', [name, password]); if (r.rows.length === 0) return res.status(401).json({ error: 'Erreur' }); res.json({ success: true, user: r.rows[0] }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// --- LIVREURS ---
app.get('/api/livreurs', async (req, res) => { try { const r = await pool.query("SELECT * FROM utilisateurs WHERE role='livreur'"); res.json(r.rows); } catch (e) { res.status(500).json({ error: e.message }); } });
app.post('/api/login-livreur', async (req, res) => {
  const { name, password } = req.body;
  try { const r = await pool.query("SELECT * FROM utilisateurs WHERE name=$1 AND role='livreur'", [name]); if (!r.rows[0] || r.rows[0].password !== password) return res.status(401).json({ error: 'Erreur' }); res.json({ success: true, livreur: r.rows[0] }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// --- ZONES ---
app.get('/api/zones', async (req, res) => { try { const r = await pool.query('SELECT * FROM zones ORDER BY nom ASC'); res.json(r.rows); } catch (e) { res.status(500).json({ error: e.message }); } });
app.post('/api/zones', async (req, res) => { const { nom, lat, lng, rayon, min_commande } = req.body; try { const r = await pool.query('INSERT INTO zones (nom,lat,lng,rayon,min_commande) VALUES ($1,$2,$3,$4,$5) RETURNING *', [nom, lat, lng, rayon, min_commande]); res.json(r.rows[0]); } catch (e) { res.status(500).json({ error: e.message }); } });
app.delete('/api/zones/:id', async (req, res) => { try { await pool.query('DELETE FROM zones WHERE id=$1', [req.params.id]); res.json({ success: true }); } catch (e) { res.status(500).json({ error: e.message }); } });

// --- ROUTE OPTIMISÉE POUR LE CATALOGUE CLIENT ---
app.get('/api/catalogue', async (req, res) => {
  try {
    const [cats, savs] = await Promise.all([
      pool.query('SELECT * FROM categories ORDER BY nom ASC'),
      pool.query('SELECT * FROM saveurs ORDER BY nom ASC')
    ]);
    res.json({ categories: cats.rows, saveurs: savs.rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// --- CATEGORIES & SAVEURS ---
app.get('/api/categories', async (req, res) => { try { const r = await pool.query('SELECT * FROM categories ORDER BY nom ASC'); res.json(r.rows); } catch (e) { res.status(500).json({ error: e.message }); } });
app.post('/api/categories', async (req, res) => { const { nom, image_url, prix_unite, prix_lot_5, prix_lot_10 } = req.body; try { const r = await pool.query('INSERT INTO categories (nom,image_url,prix_unite,prix_lot_5,prix_lot_10) VALUES ($1,$2,$3,$4,$5) RETURNING *', [nom, image_url || null, prix_unite, prix_lot_5, prix_lot_10]); res.json(r.rows[0]); } catch (e) { res.status(500).json({ error: e.message }); } });
app.delete('/api/categories/:id', async (req, res) => { try { await pool.query('DELETE FROM categories WHERE id=$1', [req.params.id]); res.json({ success: true }); } catch (e) { res.status(500).json({ error: e.message }); } });

app.get('/api/saveurs', async (req, res) => { try { const r = await pool.query('SELECT * FROM saveurs ORDER BY nom ASC'); res.json(r.rows); } catch (e) { res.status(500).json({ error: e.message }); } });
app.post('/api/saveurs', async (req, res) => { const { categorie_id, nom, stock, prix_achat } = req.body; try { const r = await pool.query('INSERT INTO saveurs (categorie_id,nom,stock,prix_achat) VALUES ($1,$2,$3,$4) RETURNING *', [categorie_id, nom, stock, prix_achat]); res.json(r.rows[0]); } catch (e) { res.status(500).json({ error: e.message }); } });
app.delete('/api/saveurs/:id', async (req, res) => { try { await pool.query('DELETE FROM saveurs WHERE id=$1', [req.params.id]); res.json({ success: true }); } catch (e) { res.status(500).json({ error: e.message }); } });

// --- VENTES ---
app.get('/api/ventes', async (req, res) => { try { const r = await pool.query("SELECT * FROM ventes WHERE date_vente::date = CURRENT_DATE ORDER BY date_vente DESC"); res.json(r.rows); } catch (e) { res.status(500).json({ error: e.message }); } });
app.post('/api/ventes', async (req, res) => { const { client_nom, categorie_nom, saveur_nom, quantite, prix_vente_total, prix_achat_total } = req.body; try { const r = await pool.query('INSERT INTO ventes (client_nom,categorie_nom,saveur_nom,quantite,prix_vente_total,prix_achat_total) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *', [client_nom, categorie_nom, saveur_nom, quantite, prix_vente_total, prix_achat_total]); res.json(r.rows[0]); } catch (e) { res.status(500).json({ error: e.message }); } });
app.delete('/api/ventes/:id', async (req, res) => { try { await pool.query('DELETE FROM ventes WHERE id=$1', [req.params.id]); res.json({ success: true }); } catch (e) { res.status(500).json({ error: e.message }); } });

// --- FALLBACK SPA ---
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => console.log(`🚀 Serveur PUFF ZONE démarré sur le port ${PORT}`));
