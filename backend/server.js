require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 5000;
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// --- INITIALISATION DE LA BASE DE DONNÉES ---
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
    
    // Auto-réparation : On force l'ajout des colonnes manquantes
    await pool.query('ALTER TABLE commandes ADD COLUMN IF NOT EXISTS livreur_id INTEGER REFERENCES utilisateurs(id);');
    await pool.query('ALTER TABLE commande_items ADD COLUMN IF NOT EXISTS prix_achat DECIMAL(10,2) DEFAULT 0;');
    
    console.log("✅ Base de données vérifiée, colonnes ajoutées !");
  } catch (e) { console.error("Erreur init DB:", e); }
};
initDB();

// --- ROUTE DE SANTÉ ---
app.get('/api/health', async (req, res) => {
  try { await pool.query('SELECT 1'); res.json({ status: 'ok', db: 'connected' }); } 
  catch (e) { res.status(500).json({ status: 'error', error: e.message }); }
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
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/clients/login', async (req, res) => {
  const { telephone } = req.body;
  try {
    const r = await pool.query('SELECT * FROM clients WHERE telephone = $1', [telephone]);
    if (r.rows.length === 0) return res.status(404).json({ success: false, error: 'Numéro non reconnu' });
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
    // 1. Créer la commande
    const cmd = await pool.query('INSERT INTO commandes (client_id, total) VALUES ($1,$2) RETURNING id', [client_id, total]);
    const cmdId = cmd.rows[0].id;
    
    // 2. Ajouter les items ET baisser le stock
    for (const item of cart) {
      // Ajout de l'item
      await pool.query('INSERT INTO commande_items (commande_id, saveur_nom, quantite, prix, prix_achat) VALUES ($1,$2,$3,$4,$5)', [cmdId, item.nom, item.qty, item.prix, item.prix_achat || 0]);
      
      // Décrémentation du stock dans la table saveurs
      await pool.query('UPDATE saveurs SET stock = stock - $1 WHERE nom = $2', [item.qty, item.nom]);
    }
    res.json({ success: true, commande_id: cmdId });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/commandes', async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT c.*, COALESCE(NULLIF(cl.nom, ''), 'Client ' || cl.telephone) as client_nom, cl.telephone, cl.whatsapp
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

// --- ASSIGNATION LIVREUR ---
app.put('/api/commandes/:id/assign', async (req, res) => {
  const { livreur_id } = req.body;
  try {
    await pool.query('UPDATE commandes SET livreur_id = $1 WHERE id = $2', [livreur_id, req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// --- COMMANDES POUR UN LIVREUR ---
app.get('/api/commandes/livreur/:id', async (req, res) => {
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
app.post('/api/login', async (req, res) => { const { name, password } = req.body; try { const r = await pool.query('SELECT * FROM utilisateurs WHERE name=$1 AND password=$2', [name, password]); if (r.rows.length === 0) return res.status(401).json({ error: 'Erreur' }); res.json({ success: true, user: r.rows[0] }); } catch (e) { res.status(500).json({ error: e.message }); } });

// --- LIVREURS ---
app.get('/api/livreurs', async (req, res) => { try { const r = await pool.query("SELECT * FROM utilisateurs WHERE role='livreur'"); res.json(r.rows); } catch (e) { res.status(500).json({ error: e.message }); } });
app.post('/api/login-livreur', async (req, res) => { const { name, password } = req.body; try { const r = await pool.query("SELECT * FROM utilisateurs WHERE name=$1 AND role='livreur'", [name]); if (!r.rows[0] || r.rows[0].password !== password) return res.status(401).json({ error: 'Erreur' }); res.json({ success: true, livreur: r.rows[0] }); } catch (e) { res.status(500).json({ error: e.message }); } });

// --- ZONES ---
app.get('/api/zones', async (req, res) => { try { const r = await pool.query('SELECT * FROM zones ORDER BY nom ASC'); res.json(r.rows); } catch (e) { res.status(500).json({ error: e.message }); } });
app.post('/api/zones', async (req, res) => { const { nom, lat, lng, rayon, min_commande } = req.body; try { const r = await pool.query('INSERT INTO zones (nom,lat,lng,rayon,min_commande) VALUES ($1,$2,$3,$4,$5) RETURNING *', [nom, lat, lng, rayon, min_commande]); res.json(r.rows[0]); } catch (e) { res.status(500).json({ error: e.message }); } });
app.delete('/api/zones/:id', async (req, res) => { try { await pool.query('DELETE FROM zones WHERE id=$1', [req.params.id]); res.json({ success: true }); } catch (e) { res.status(500).json({ error: e.message }); } });

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

app.get('/api/categories', async (req, res) => { try { const r = await pool.query('SELECT * FROM categories ORDER BY nom ASC'); res.json(r.rows); } catch (e) { res.status(500).json({ error: e.message }); } });
app.post('/api/categories', async (req, res) => { const { nom, image_url, prix_unite, prix_lot_5, prix_lot_10 } = req.body; try { const r = await pool.query('INSERT INTO categories (nom,image_url,prix_unite,prix_lot_5,prix_lot_10) VALUES ($1,$2,$3,$4,$5) RETURNING *', [nom, image_url || null, prix_unite, prix_lot_5, prix_lot_10]); res.json(r.rows[0]); } catch (e) { res.status(500).json({ error: e.message }); } });
app.delete('/api/categories/:id', async (req, res) => { try { await pool.query('DELETE FROM categories WHERE id=$1', [req.params.id]); res.json({ success: true }); } catch (e) { res.status(500).json({ error: e.message }); } });

app.get('/api/saveurs', async (req, res) => { try { const r = await pool.query('SELECT * FROM saveurs ORDER BY nom ASC'); res.json(r.rows); } catch (e) { res.status(500).json({ error: e.message }); } });
app.post('/api/saveurs', async (req, res) => { const { categorie_id, nom, stock, prix_achat } = req.body; try { const r = await pool.query('INSERT INTO saveurs (categorie_id,nom,stock,prix_achat) VALUES ($1,$2,$3,$4) RETURNING *', [categorie_id, nom, stock, prix_achat]); res.json(r.rows[0]); } catch (e) { res.status(500).json({ error: e.message }); } });
app.delete('/api/saveurs/:id', async (req, res) => { try { await pool.query('DELETE FROM saveurs WHERE id=$1', [req.params.id]); res.json({ success: true }); } catch (e) { res.status(500).json({ error: e.message }); } });

// --- VENTES ---
app.get('/api/ventes', async (req, res) => { 
  try { 
    // On récupère les commandes livrées du jour
    const r = await pool.query(`
      SELECT c.id, c.client_id, c.total as prix_vente_total, c.date_commande as date_vente,
             COALESCE((SELECT SUM(prix_achat * quantite) FROM commande_items WHERE commande_id = c.id), 0) as prix_achat_total,
             COALESCE(NULLIF(cl.nom, ''), 'Client ' || cl.telephone) as client_nom
      FROM commandes c 
      LEFT JOIN clients cl ON c.client_id = cl.id
      WHERE c.statut = 'livre' AND c.date_commande::date = CURRENT_DATE
      ORDER BY c.date_commande DESC
    `); 
    
    // On calcule le total global côté serveur
    let totalCA = 0;
    let totalMarge = 0;
    r.rows.forEach(v => {
      totalCA += parseFloat(v.prix_vente_total);
      totalMarge += (parseFloat(v.prix_vente_total) - parseFloat(v.prix_achat_total));
    });

    res.json({ ventes: r.rows, totalCA: totalCA, totalMarge: totalMarge }); 
  } catch (e) { res.status(500).json({ error: e.message }); } 
});
app.post('/api/ventes', async (req, res) => { const { client_nom, categorie_nom, saveur_nom, quantite, prix_vente_total, prix_achat_total } = req.body; try { const r = await pool.query('INSERT INTO ventes (client_nom,categorie_nom,saveur_nom,quantite,prix_vente_total,prix_achat_total) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *', [client_nom, categorie_nom, saveur_nom, quantite, prix_vente_total, prix_achat_total]); res.json(r.rows[0]); } catch (e) { res.status(500).json({ error: e.message }); } });
app.delete('/api/ventes/:id', async (req, res) => { try { await pool.query('DELETE FROM ventes WHERE id=$1', [req.params.id]); res.json({ success: true }); } catch (e) { res.status(500).json({ error: e.message }); } });

// --- FALLBACK SPA ---
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => console.log(`🚀 Serveur PUFF ZONE démarré sur le port ${PORT}`));