require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const crypto = require('crypto');
const { Pool } = require('pg');
const { authenticateToken, isAdmin, checkPassword, generateToken } = require('./auth');

const app = express();
const PORT = process.env.PORT || 5000;
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ===== HELPERS =====
function getBrusselsTime() {
  return new Intl.DateTimeFormat('fr-BE', { timeZone: 'Europe/Brussels', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date());
}
async function isOrderingOpen() {
  try {
    const r = await pool.query("SELECT key, value FROM settings WHERE key IN ('order_start_time', 'order_end_time')");
    let start = '22:00', end = '06:00';
    r.rows.forEach(row => {
      if (row.key === 'order_start_time') start = row.value;
      if (row.key === 'order_end_time') end = row.value;
    });
    const now = getBrusselsTime();
    if (start <= end) return now >= start && now <= end;
    return now >= start || now <= end;
  } catch (e) { return true; }
}

// ===== MAINTENANCE =====
let _maintenanceCache = { value: false, timestamp: 0 };
const _MAINT_TTL = 10000;
async function _checkMaintenance() {
  const now = Date.now();
  if (now - _maintenanceCache.timestamp < _MAINT_TTL) return _maintenanceCache.value;
  try {
    const r = await pool.query("SELECT value FROM settings WHERE key = 'maintenance_mode' LIMIT 1");
    _maintenanceCache.value = r.rows.length > 0 && r.rows[0].value === 'true';
    _maintenanceCache.timestamp = now;
    return _maintenanceCache.value;
  } catch (e) { return false; }
}

app.use(async (req, res, next) => {
  const p = req.path;
  if (p === '/maintenance.html' || p === '/favicon.ico') return next();
  if (p.startsWith('/admin')) return next();
  if (p.startsWith('/api/admin')) return next();
  if (p === '/api/login' || p === '/api/login-livreur') return next();
  if (p === '/api/health') return next();
  try {
    const isMaint = await _checkMaintenance();
    if (isMaint) {
      if (p.startsWith('/api/')) return res.status(503).json({ error: 'Maintenance en cours.' });
      return res.status(503).sendFile(path.join(__dirname, 'public', 'maintenance.html'));
    }
    next();
  } catch (e) { next(); }
});

let isLockdown = false;
app.use((req, res, next) => {
  if (isLockdown && req.method !== 'GET' && !req.path.includes('/login') && !req.path.includes('/security')) {
    return res.status(503).json({ error: 'SYSTÈME EN LOCKDOWN.' });
  }
  next();
});

const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, message: { error: 'Trop de tentatives.' } });
const publicLimiter = rateLimit({ windowMs: 1 * 60 * 1000, max: 15, message: { error: 'Trop de requêtes. Veuillez patienter une minute.' } });

const logAction = async (user, action, details) => {
  try { await pool.query('INSERT INTO logs_activite (user_name, user_role, action, details) VALUES ($1, $2, $3, $4)', [user ? user.name : 'Inconnu', user ? user.role : 'Inconnu', action, details]); } catch (e) {}
};

const initDB = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS utilisateurs (id SERIAL PRIMARY KEY, name VARCHAR(100) UNIQUE NOT NULL, password VARCHAR(255) NOT NULL, role VARCHAR(50) NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
      CREATE TABLE IF NOT EXISTS clients (id SERIAL PRIMARY KEY, telephone VARCHAR(50) UNIQUE NOT NULL, nom VARCHAR(100), adresse TEXT, whatsapp VARCHAR(50), created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
      CREATE TABLE IF NOT EXISTS commandes (id SERIAL PRIMARY KEY, client_id INTEGER REFERENCES clients(id), total DECIMAL(10,2), statut VARCHAR(50) DEFAULT 'en_attente', date_commande TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
      CREATE TABLE IF NOT EXISTS commande_items (id SERIAL PRIMARY KEY, commande_id INTEGER REFERENCES commandes(id) ON DELETE CASCADE, saveur_nom VARCHAR(100), quantite INTEGER, prix DECIMAL(10,2));
      CREATE TABLE IF NOT EXISTS codes_promo (id SERIAL PRIMARY KEY, code VARCHAR(50) UNIQUE NOT NULL, pourcentage INTEGER NOT NULL, actif BOOLEAN DEFAULT true, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
      CREATE TABLE IF NOT EXISTS zones (id SERIAL PRIMARY KEY, nom VARCHAR(100), lat DECIMAL(10,8), lng DECIMAL(11,8), rayon INTEGER, min_commande INTEGER);
      CREATE TABLE IF NOT EXISTS backup_commandes (id SERIAL PRIMARY KEY, date_backup TIMESTAMP DEFAULT CURRENT_TIMESTAMP, data JSONB);
      CREATE TABLE IF NOT EXISTS logs_activite (id SERIAL PRIMARY KEY, date_log TIMESTAMP DEFAULT CURRENT_TIMESTAMP, user_name VARCHAR(100), user_role VARCHAR(50), action VARCHAR(255), details TEXT);
      CREATE TABLE IF NOT EXISTS categories (id SERIAL PRIMARY KEY, nom VARCHAR(100), image_url TEXT, prix_unite DECIMAL(10,2), prix_lot_5 DECIMAL(10,2), prix_lot_10 DECIMAL(10,2), is_featured BOOLEAN DEFAULT false);
      CREATE TABLE IF NOT EXISTS saveurs (id SERIAL PRIMARY KEY, categorie_id INTEGER REFERENCES categories(id) ON DELETE CASCADE, nom VARCHAR(100), stock INTEGER DEFAULT 0);
      CREATE TABLE IF NOT EXISTS settings (key VARCHAR(50) PRIMARY KEY, value TEXT);
      CREATE TABLE IF NOT EXISTS avis (id SERIAL PRIMARY KEY, note INTEGER NOT NULL, commentaire TEXT NOT NULL, date_creation TIMESTAMP DEFAULT CURRENT_TIMESTAMP, approuve BOOLEAN DEFAULT false);
      CREATE TABLE IF NOT EXISTS sondages (id SERIAL PRIMARY KEY, question TEXT NOT NULL, options JSONB NOT NULL, actif BOOLEAN DEFAULT true, date_creation TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
      CREATE TABLE IF NOT EXISTS sondage_votes (id SERIAL PRIMARY KEY, sondage_id INTEGER REFERENCES sondages(id) ON DELETE CASCADE, option_index INTEGER NOT NULL, ip_hash VARCHAR(64), date_vote TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
    `);
    await pool.query('ALTER TABLE commandes ADD COLUMN IF NOT EXISTS livreur_id INTEGER REFERENCES utilisateurs(id);');
    await pool.query('ALTER TABLE commandes ADD COLUMN IF NOT EXISTS valide_par VARCHAR(100);');
    await pool.query('ALTER TABLE commandes ADD COLUMN IF NOT EXISTS promo_code VARCHAR(50);');
    await pool.query('ALTER TABLE commandes ADD COLUMN IF NOT EXISTS zone_nom VARCHAR(100);');
    await pool.query('ALTER TABLE commande_items ADD COLUMN IF NOT EXISTS prix_achat DECIMAL(10,2) DEFAULT 0;');
    await pool.query('ALTER TABLE commande_items ADD COLUMN IF NOT EXISTS categorie_nom VARCHAR(100);');
    await pool.query('ALTER TABLE categories ADD COLUMN IF NOT EXISTS is_featured BOOLEAN DEFAULT false;');
    await pool.query('ALTER TABLE categories ADD COLUMN IF NOT EXISTS ordre INTEGER DEFAULT 0;');
    await pool.query('ALTER TABLE clients ADD COLUMN IF NOT EXISTS is_banned BOOLEAN DEFAULT false;');
    await pool.query('ALTER TABLE clients ADD COLUMN IF NOT EXISTS ban_reason TEXT;');
    await pool.query('ALTER TABLE categories ADD COLUMN IF NOT EXISTS visible_client BOOLEAN DEFAULT true;');
    await pool.query('UPDATE categories SET ordre = id WHERE ordre = 0;');
    
    await pool.query("INSERT INTO settings (key, value) VALUES ('banner_text', 'LIVRAISON SPATIALE RAPIDE 24/48H EN FRANCE & BELGIQUE') ON CONFLICT (key) DO NOTHING");
    await pool.query("INSERT INTO settings (key, value) VALUES ('maintenance_mode', 'false') ON CONFLICT (key) DO NOTHING");
    await pool.query("INSERT INTO settings (key, value) VALUES ('order_start_time', '22:00'), ('order_end_time', '06:00') ON CONFLICT (key) DO NOTHING");
    await pool.query("INSERT INTO settings (key, value) VALUES ('lockdown', 'false') ON CONFLICT (key) DO NOTHING");
    const lockRes = await pool.query("SELECT value FROM settings WHERE key = 'lockdown'");
    isLockdown = lockRes.rows[0].value === 'true';
    
    console.log("✅ DB Ready !");
  } catch (e) { console.error("Erreur init DB:", e); }
};
initDB();

// ===== ROUTES SETTINGS =====
app.get('/api/settings', async (req, res) => {
  try { const r = await pool.query('SELECT * FROM settings'); const settings = {}; r.rows.forEach(row => settings[row.key] = row.value); res.json(settings); } catch (e) { res.status(500).json({ error: 'Erreur' }); }
});
app.put('/api/settings', authenticateToken, isAdmin, async (req, res) => {
  const { banner_text } = req.body;
  try {
    await pool.query("UPDATE settings SET value = $1 WHERE key = 'banner_text'", [banner_text]);
    await logAction(req.user, 'Modification Paramètres', 'Bandeau mis à jour');
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Erreur' }); }
});

app.get('/api/settings/order-window', async (req, res) => {
  try {
    const r = await pool.query("SELECT key, value FROM settings WHERE key IN ('order_start_time', 'order_end_time')");
    let start = '22:00', end = '06:00';
    r.rows.forEach(row => {
      if (row.key === 'order_start_time') start = row.value;
      if (row.key === 'order_end_time') end = row.value;
    });
    const isOpen = await isOrderingOpen();
    res.json({ start, end, isOpen });
  } catch(e) { res.status(500).json({ error: 'Erreur' }); }
});

app.put('/api/settings/order-window', authenticateToken, isAdmin, async (req, res) => {
  try {
    const { start, end } = req.body;
    await pool.query("UPDATE settings SET value = $1 WHERE key = 'order_start_time'", [start]);
    await pool.query("UPDATE settings SET value = $1 WHERE key = 'order_end_time'", [end]);
    await logAction(req.user, 'Modification Horaires', `${start} -> ${end}`);
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: 'Erreur' }); }
});

// ===== ROUTES AUTH & CLIENTS =====
app.post('/api/login', loginLimiter, async (req, res) => { 
  const { name, password } = req.body; 
  try { 
    const r = await pool.query('SELECT * FROM utilisateurs WHERE name=$1', [name]); 
    if (r.rows.length === 0) return res.status(401).json({error: 'Incorrect' }); 
    const user = r.rows[0]; 
    if (!(await checkPassword(password, user.password))) return res.status(401).json({ error: 'Incorrect' }); 
    const token = generateToken(user); 
    await logAction(user, 'Connexion', 'Succès'); 
    res.json({ success: true, token, user: { id: user.id, name: user.name, role: user.role } }); 
  } catch (e) { res.status(500).json({ error: 'Erreur' }); } 
});

app.post('/api/login-livreur', loginLimiter, async (req, res) => { 
  const { name, password } = req.body; 
  try { 
    const r = await pool.query("SELECT * FROM utilisateurs WHERE name=$1 AND role='livreur'", [name]); 
    if (r.rows.length === 0) return res.status(401).json({ error: 'Incorrect' }); 
    const livreur = r.rows[0]; 
    if (!(await checkPassword(password, livreur.password))) return res.status(401).json({ error: 'Incorrect' }); 
    const token = generateToken(livreur); 
    await logAction(livreur, 'Connexion Livreur', 'Succès'); 
    res.json({ success: true, token, livreur: { id: livreur.id, name: livreur.name, role: livreur.role } }); 
  } catch (e) { res.status(500).json({ error: 'Erreur' }); } 
});

app.post('/api/clients/register', publicLimiter, async (req, res) => { 
  const { telephone, nom, adresse, whatsapp } = req.body; 
  try { 
    let r = await pool.query('SELECT * FROM clients WHERE telephone = $1', [telephone]); 
    if (r.rows.length === 0) r = await pool.query('INSERT INTO clients (telephone, nom, adresse, whatsapp) VALUES ($1,$2,$3,$4) RETURNING *', [telephone, nom, adresse, whatsapp]); 
    else r = await pool.query('UPDATE clients SET nom=$1, adresse=$2, whatsapp=$3 WHERE telephone=$4 RETURNING *', [nom, adresse, whatsapp, telephone]); 
    res.json({ success: true, client: r.rows[0] }); 
  } catch (e) { res.status(500).json({ error: 'Erreur' }); } 
});

app.post('/api/clients/login', async (req, res) => { 
  const { telephone } = req.body; 
  try { 
    const r = await pool.query('SELECT * FROM clients WHERE telephone = $1', [telephone]); 
    if (r.rows.length === 0) return res.status(404).json({ error: 'Non reconnu' }); 
    
    if (r.rows[0].is_banned) {
      return res.status(403).json({ 
        error: 'banned', 
        reason: r.rows[0].ban_reason || 'Votre compte a ete suspendu.' 
      });
    }
    
    res.json({ success: true, client: r.rows[0] }); 
  } catch (e) { res.status(500).json({ error: 'Erreur' }); } 
});

app.put('/api/clients/:id', async (req, res) => { 
  const { nom, adresse, whatsapp } = req.body; 
  try { 
    const r = await pool.query('UPDATE clients SET nom=$1, adresse=$2, whatsapp=$3 WHERE id=$4 RETURNING *', [nom, adresse, whatsapp, req.params.id]); 
    res.json({ success: true, client: r.rows[0] }); 
  } catch (e) { res.status(500).json({ error: 'Erreur' }); } 
});

app.delete('/api/clients/:id', authenticateToken, isAdmin, async (req, res) => {
  try {
    await pool.query('DELETE FROM clients WHERE id=$1', [req.params.id]);
    await logAction(req.user, 'Suppression Client', `ID: ${req.params.id}`);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Erreur' }); }
});

app.get('/api/clients/:id/commandes', async (req, res) => { 
  try { 
    const r = await pool.query(`SELECT c.*, (SELECT json_agg(json_build_object('saveur', ci.saveur_nom, 'qte', ci.quantite, 'prix', ci.prix)) FROM commande_items ci WHERE ci.commande_id = c.id) as items FROM commandes c WHERE c.client_id = $1 ORDER BY c.date_commande DESC`, [req.params.id]); 
    res.json(r.rows); 
  } catch (e) { res.status(500).json({ error: 'Erreur' }); } 
});

app.get('/api/clients', authenticateToken, isAdmin, async (req, res) => { 
  try { 
    const r = await pool.query('SELECT * FROM clients ORDER BY created_at DESC'); 
    res.json(r.rows); 
  } catch (e) { res.status(500).json({ error: 'Erreur' }); } 
});

// ===== ROUTES CATALOGUE =====
app.get('/api/catalogue', async (req, res) => { try { const [cats, savs] = await Promise.all([ pool.query('SELECT * FROM categories WHERE visible_client = true ORDER BY ordre ASC, id ASC'), pool.query('SELECT * FROM saveurs ORDER BY nom ASC') ]); res.json({ categories: cats.rows, saveurs: savs.rows }); } catch (e) { res.status(500).json({ error: 'Erreur' }); } });

app.get('/api/categories', authenticateToken, isAdmin, async (req, res) => { 
  try { const r = await pool.query('SELECT * FROM categories ORDER BY ordre ASC, id ASC'); res.json(r.rows); } catch (e) { res.status(500).json({ error: 'Erreur' }); } 
});

app.put('/api/categories/reorder', authenticateToken, isAdmin, async (req, res) => {
  const { order } = req.body; 
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (let i = 0; i < order.length; i++) {
      await client.query('UPDATE categories SET ordre = $1 WHERE id = $2', [i, order[i]]);
    }
    await client.query('COMMIT');
    res.json({ success: true });
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: 'Erreur lors de la mise à jour de l\'ordre' });
  } finally {
    client.release();
  }
});

app.post('/api/categories', authenticateToken, isAdmin, async (req, res) => {
  const { nom, image_url, prix_unite, prix_lot_5, prix_lot_10, is_featured } = req.body;
  try {
    const r = await pool.query('INSERT INTO categories (nom,image_url,prix_unite,prix_lot_5,prix_lot_10, is_featured) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *', [nom, image_url || null, prix_unite, prix_lot_5, prix_lot_10, is_featured || false]);
    await logAction(req.user, 'Creation Catégorie', nom);
    res.json(r.rows[0]);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erreur lors de la création' });
  }
});

app.put('/api/categories/:id', authenticateToken, isAdmin, async (req, res) => {
  const { nom, image_url, prix_unite, prix_lot_5, prix_lot_10, is_featured } = req.body;
  try {
    await pool.query('UPDATE categories SET nom=$1, image_url=$2, prix_unite=$3, prix_lot_5=$4, prix_lot_10=$5, is_featured=$6 WHERE id=$7', [nom, image_url || null, prix_unite, prix_lot_5, prix_lot_10, is_featured || false, req.params.id]);
    await logAction(req.user, 'Modif Catégorie', nom);
    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erreur lors de la modification' });
  }
});

// ===== TOGGLE VISIBILITE CATEGORIE =====
app.put('/api/admin/categories/:id/visibility', authenticateToken, isAdmin, async (req, res) => {
  try {
    const r = await pool.query('UPDATE categories SET visible_client = NOT visible_client WHERE id = $1 RETURNING id, nom, visible_client', [req.params.id]);
    if (r.rows.length === 0) return res.status(404).json({ error: 'Categorie introuvable' });
    await logAction(req.user, 'Visibilite Categorie', `ID: ${req.params.id} - ${r.rows[0].visible_client ? 'Visible' : 'Masquee'}`);
    res.json({ success: true, visible_client: r.rows[0].visible_client });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Erreur' }); }
});
// ========================================

app.delete('/api/categories/:id', authenticateToken, isAdmin, async (req, res) => { 
  try { await pool.query('DELETE FROM categories WHERE id=$1', [req.params.id]); await logAction(req.user, 'Suppr Catégorie', `ID: ${req.params.id}`); res.json({ success: true }); } catch (e) { res.status(500).json({ error: 'Erreur' }); } 
});

app.get('/api/saveurs', authenticateToken, isAdmin, async (req, res) => { 
  try { const r = await pool.query('SELECT * FROM saveurs ORDER BY nom ASC'); res.json(r.rows); } catch (e) { res.status(500).json({ error: 'Erreur' }); } 
});

app.post('/api/saveurs', authenticateToken, isAdmin, async (req, res) => { 
  const { categorie_id, nom, stock } = req.body; 
  try { 
    const r = await pool.query('INSERT INTO saveurs (categorie_id,nom,stock) VALUES ($1,$2,$3) RETURNING *', [categorie_id, nom, stock]); 
    await logAction(req.user, 'Creation Saveur', nom); 
    res.json(r.rows[0]); 
  } catch (e) { res.status(500).json({ error: 'Erreur' }); } 
});

app.put('/api/saveurs/:id', authenticateToken, isAdmin, async (req, res) => { 
  const { categorie_id, nom, stock } = req.body; 
  try { 
    await pool.query('UPDATE saveurs SET categorie_id=$1, nom=$2, stock=$3 WHERE id=$4', [categorie_id, nom, stock, req.params.id]); 
    await logAction(req.user, 'Modif Saveur', nom); 
    res.json({ success: true }); 
  } catch (e) { res.status(500).json({ error: 'Erreur' }); } 
});

app.delete('/api/saveurs/:id', authenticateToken, isAdmin, async (req, res) => { 
  try { await pool.query('DELETE FROM saveurs WHERE id=$1', [req.params.id]); await logAction(req.user, 'Suppr Saveur', `ID: ${req.params.id}`); res.json({ success: true }); } catch (e) { res.status(500).json({ error: 'Erreur' }); } 
});

// ===== ROUTES ZONES =====
app.get('/api/zones', async (req, res) => { 
  try { const r = await pool.query('SELECT * FROM zones ORDER BY nom ASC'); res.json(r.rows); } catch (e) { res.status(500).json({ error: 'Erreur' }); } 
});

app.post('/api/zones', authenticateToken, isAdmin, async (req, res) => { 
  const { nom, lat, lng, rayon, min_commande } = req.body; 
  try { 
    const r = await pool.query('INSERT INTO zones (nom,lat,lng,rayon,min_commande) VALUES ($1,$2,$3,$4,$5) RETURNING *', [nom, lat, lng, rayon, min_commande]); 
    await logAction(req.user, 'Creation Zone', nom); 
    res.json(r.rows[0]); 
  } catch (e) { res.status(500).json({ error: 'Erreur' }); } 
});

app.put('/api/zones/:id', authenticateToken, isAdmin, async (req, res) => { 
  const { nom, lat, lng, rayon, min_commande } = req.body; 
  try { 
    await pool.query('UPDATE zones SET nom=$1, lat=$2, lng=$3, rayon=$4, min_commande=$5 WHERE id=$6', [nom, lat, lng, rayon, min_commande, req.params.id]); 
    await logAction(req.user, 'Modif Zone', nom); 
    res.json({ success: true }); 
  } catch (e) { res.status(500).json({ error: 'Erreur' }); } 
});

app.delete('/api/zones/:id', authenticateToken, isAdmin, async (req, res) => { 
  try { 
    await pool.query('DELETE FROM zones WHERE id=$1', [req.params.id]); 
    await logAction(req.user, 'Suppr Zone', `ID: ${req.params.id}`); 
    res.json({ success: true }); 
  } catch (e) { res.status(500).json({ error: 'Erreur' }); } 
});

// ===== ROUTES COMMANDES =====
app.post('/api/commandes', publicLimiter, async (req, res) => {
  const isOpen = await isOrderingOpen();
  if (!isOpen) {
    return res.status(403).json({ error: "Les commandes sont actuellement fermées. Revenez pendant nos horaires d'ouverture." });
  }
 
  const { client_id, cart, total, promo_code, valide_par, zone } = req.body; 
  const client = await pool.connect();
  
  try { 
    await client.query('BEGIN');

    let calculatedTotal = 0;

    // --- NOUVEAU CALCUL : REGROUPEMENT PAR CATÉGORIE POUR LOTS MIXTES ---
    const itemsByCategory = {};
    for (const item of cart) {
        const catInfo = await client.query('SELECT s.stock, s.categorie_id, c.prix_unite, c.prix_lot_5, c.prix_lot_10, c.nom as cat_nom FROM saveurs s JOIN categories c ON s.categorie_id = c.id WHERE s.id = $1 FOR UPDATE', [item.id]);
        
        if (catInfo.rows.length === 0 || item.qty > catInfo.rows[0].stock) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: `Stock insuffisant ou produit introuvable : "${item.nom}".` });
        }

        const catData = catInfo.rows[0];
        const catId = catData.categorie_id;
        
        if (!itemsByCategory[catId]) {
            itemsByCategory[catId] = {
                prix_unite: parseFloat(catData.prix_unite),
                prix_lot_5: catData.prix_lot_5 ? parseFloat(catData.prix_lot_5) : null,
                prix_lot_10: catData.prix_lot_10 ? parseFloat(catData.prix_lot_10) : null,
                total_qty: 0,
                items: []
            };
        }
        itemsByCategory[catId].total_qty += item.qty;
        itemsByCategory[catId].items.push(item);
    }

    for (const catId in itemsByCategory) {
        const cat = itemsByCategory[catId];
        let qty = cat.total_qty;
        
        if (cat.prix_lot_10 && qty >= 10) {
            const nbLots10 = Math.floor(qty / 10);
            calculatedTotal += nbLots10 * cat.prix_lot_10;
            qty = qty % 10;
        }
        if (cat.prix_lot_5 && qty >= 5) {
            const nbLots5 = Math.floor(qty / 5);
            calculatedTotal += nbLots5 * cat.prix_lot_5;
            qty = qty % 5;
        }
        if (qty > 0) {
            calculatedTotal += qty * cat.prix_unite;
        }
    }

    let finalTotal = calculatedTotal; 
    if (promo_code) { 
      const p = await client.query('SELECT * FROM codes_promo WHERE UPPER(code) = UPPER($1)', [promo_code]); 
      if (p.rows.length > 0) finalTotal -= (finalTotal * (p.rows[0].pourcentage / 100)); 
    } 

    const cmd = await client.query('INSERT INTO commandes (client_id, total, valide_par, promo_code, zone_nom) VALUES ($1,$2,$3,$4,$5) RETURNING id', [client_id, finalTotal, valide_par || 'Client', promo_code || null, zone || null]); 
    
    for (const item of cart) { 
      const catInfo = await client.query('SELECT s.categorie_id, c.prix_unite, c.nom as cat_nom FROM saveurs s JOIN categories c ON s.categorie_id = c.id WHERE s.id = $1', [item.id]);
      
      await client.query('INSERT INTO commande_items (commande_id, saveur_nom, quantite, prix, categorie_nom) VALUES ($1,$2,$3,$4,$5)', 
          [cmd.rows[0].id, item.nom, item.qty, catInfo.rows[0].prix_unite, catInfo.rows[0].cat_nom]); 
          
      await client.query('UPDATE saveurs SET stock = stock - $1 WHERE id = $2', [item.qty, item.id]); 
    } 

    await client.query('COMMIT');
    await logAction({name: valide_par || 'Client', role: 'client'}, 'Nouvelle Commande', `Cmd #${cmd.rows[0].id} - Total: ${finalTotal.toFixed(2)}€`); 
    res.json({ success: true, commande_id: cmd.rows[0].id, finalTotal }); 
    
  } catch (e) { 
    await client.query('ROLLBACK');
    console.error(e);
    res.status(500).json({ error: 'Erreur lors de la commande.' }); 
  } finally {
    client.release();
  }
});

app.get('/api/commandes', authenticateToken, isAdmin, async (req, res) => {
  try {
    const r = await pool.query(`SELECT c.*, c.zone_nom, COALESCE(NULLIF(cl.nom, ''), 'Client ' || cl.telephone) as client_nom, cl.telephone, cl.whatsapp, cl.adresse, (SELECT json_agg(json_build_object('nom', ci.saveur_nom, 'categorie', ci.categorie_nom, 'qte', ci.quantite, 'prix', ci.prix)) FROM commande_items ci WHERE ci.commande_id = c.id) as items FROM commandes c LEFT JOIN clients cl ON c.client_id = cl.id ORDER BY c.date_commande DESC`);
    res.json(r.rows);
  } catch (e) {
    res.status(500).json({ error: 'Erreur' });
  }
});

app.delete('/api/commandes/:id', authenticateToken, isAdmin, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const items = await client.query('SELECT saveur_nom, quantite FROM commande_items WHERE commande_id = $1', [req.params.id]);
    for (const item of items.rows) {
      await client.query('UPDATE saveurs SET stock = stock + $1 WHERE nom = $2', [item.quantite, item.saveur_nom]);
    }
    await client.query('DELETE FROM commande_items WHERE commande_id = $1', [req.params.id]);
    await client.query('DELETE FROM commandes WHERE id = $1', [req.params.id]);
    await client.query('COMMIT');
    await logAction(req.user, 'Suppression Commande', `Cmd #${req.params.id} supprimée (Stock restauré)`);
    res.json({ success: true });
  } catch (e) {
    await client.query('ROLLBACK');
    console.error(e);
    res.status(500).json({ error: 'Erreur lors de la suppression.' });
  } finally {
    client.release();
  }
});

app.put('/api/commandes/:id/statut', authenticateToken, async (req, res) => { 
  const { statut } = req.body; 
  try { 
    const c = await pool.query('SELECT statut, livreur_id FROM commandes WHERE id=$1', [req.params.id]); 
    if (c.rows.length === 0) return res.status(404).json({ error: 'Commande introuvable' });
    if (c.rows[0].statut === 'livre') return res.status(400).json({ error: 'Déjà livrée' }); 
    
    // Si l'utilisateur est un livreur, on vérifie que la commande lui est bien assignée
    if (req.user.role === 'livreur') {
      if (c.rows[0].livreur_id !== req.user.id) {
        return res.status(403).json({ error: 'Cette commande ne vous est pas assignée.' });
      }
    }
    
    await pool.query('UPDATE commandes SET statut=$1 WHERE id=$2', [statut, req.params.id]); 
    await logAction(req.user, 'Statut Commande', `Cmd #${req.params.id} -> ${statut}`); 
    res.json({ success: true }); 
  } catch (e) { res.status(500).json({ error: 'Erreur' }); } 
});

app.put('/api/commandes/:id/assign', authenticateToken, isAdmin, async (req, res) => { 
  const { livreur_id } = req.body; 
  try { 
    await pool.query('UPDATE commandes SET livreur_id = $1 WHERE id = $2', [livreur_id, req.params.id]); 
    await logAction(req.user, 'Assignation', `Cmd #${req.params.id} -> Livreur ${livreur_id}`); 
    res.json({ success: true }); 
  } catch (e) { res.status(500).json({ error: 'Erreur' }); } 
});

app.get('/api/commandes/livreur/:id', authenticateToken, async (req, res) => { 
  try { 
    const r = await pool.query(`SELECT c.*, c.zone_nom, COALESCE(NULLIF(cl.nom, ''), 'Client ' || cl.telephone) as client_nom, cl.telephone, cl.whatsapp, cl.adresse, (SELECT json_agg(json_build_object('nom', ci.saveur_nom, 'categorie', ci.categorie_nom, 'qte', ci.quantite, 'prix', ci.prix)) FROM commande_items ci WHERE ci.commande_id = c.id) as items FROM commandes c LEFT JOIN clients cl ON c.client_id = cl.id WHERE c.livreur_id = $1 AND c.statut != 'livre' ORDER BY c.date_commande DESC`, [req.params.id]); 
    res.json(r.rows); 
  } catch (e) { res.status(500).json({ error: 'Erreur' }); } 
});

app.get('/api/commandes/livreur/:id/historique', authenticateToken, async (req, res) => { 
  try { 
    const r = await pool.query(`SELECT c.id, c.total, c.date_commande, COALESCE(NULLIF(cl.nom, ''), 'Client ' || cl.telephone) as client_nom FROM commandes c LEFT JOIN clients cl ON c.client_id = cl.id WHERE c.livreur_id = $1 AND c.statut = 'livre' ORDER BY c.date_commande DESC`, [req.params.id]); 
    res.json(r.rows); 
  } catch (e) { res.status(500).json({ error: 'Erreur' }); } 
});

app.get('/api/livreur/:id/stats', authenticateToken, async (req, res) => { 
  try { 
    const r = await pool.query(`SELECT COUNT(id) as total_livraisons, COALESCE(SUM(total), 0) as total_ca FROM commandes WHERE livreur_id = $1 AND statut = 'livre'`, [req.params.id]); 
    res.json(r.rows[0]); 
  } catch (e) { res.status(500).json({ error: 'Erreur' }); } 
});

app.get('/api/livreurs', authenticateToken, isAdmin, async (req, res) => { 
  try { 
    const r = await pool.query(`SELECT u.id, u.name, u.role, (SELECT COUNT(c.id) FROM commandes c WHERE c.livreur_id = u.id AND c.statut = 'livre') as total_livraisons, COALESCE((SELECT SUM(c.total) FROM commandes c WHERE c.livreur_id = u.id AND c.statut = 'livre'), 0) as total_ca FROM utilisateurs u WHERE u.role = 'livreur'`); 
    res.json(r.rows); 
  } catch (e) { res.status(500).json({ error: 'Erreur' }); } 
});

app.get('/api/ventes', authenticateToken, isAdmin, async (req, res) => {
  try { 
    const r = await pool.query(`SELECT c.id, c.client_id, c.total as prix_vente_total, c.date_commande as date_vente, c.valide_par, c.promo_code, COALESCE(NULLIF(cl.nom, ''), 'Client ' || cl.telephone) as client_nom, (SELECT json_agg(json_build_object('nom', ci.saveur_nom, 'categorie', ci.categorie_nom, 'qte', ci.quantite, 'prix', ci.prix)) FROM commande_items ci WHERE ci.commande_id = c.id) as items FROM commandes c LEFT JOIN clients cl ON c.client_id = cl.id WHERE LOWER(c.statut) LIKE '%livr%' ORDER BY c.date_commande DESC`); 
    let totalCA = 0; 
    r.rows.forEach(v => totalCA += parseFloat(v.prix_vente_total)); 
    res.json({ ventes: r.rows, totalCA }); 
  } catch (e) { res.status(500).json({ error: 'Erreur' }); }
});

app.get('/api/stats', authenticateToken, isAdmin, async (req, res) => { 
  try { 
    const top = await pool.query(`SELECT saveur_nom, SUM(quantite) as total_qte FROM commande_items GROUP BY saveur_nom ORDER BY total_qte DESC LIMIT 5`); 
    const ca7 = await pool.query(`SELECT TO_CHAR(date_commande, 'DD/MM') as jour, SUM(total) as ca FROM commandes WHERE statut = 'livre' AND date_commande >= NOW() - INTERVAL '7 days' GROUP BY TO_CHAR(date_commande, 'DD/MM'), DATE_TRUNC('day', date_commande) ORDER BY DATE_TRUNC('day', date_commande) ASC`); 
    res.json({ topSaveurs: top.rows, ca7jours: ca7.rows }); 
  } catch(e) { res.status(500).json({ error: 'Erreur' }); } 
});

// ===== ROUTES AVIS =====
app.post('/api/avis', publicLimiter, async (req, res) => {
  const { note, commentaire } = req.body;
  if (!note || note < 1 || note > 5 || !commentaire) {
    return res.status(400).json({ error: 'Note (1-5) et commentaire requis.' });
  }
  try {
    await pool.query('INSERT INTO avis (note, commentaire) VALUES ($1, $2)', [note, commentaire]);
    res.json({ success: true, message: 'Merci ! Votre avis sera visible apres validation.' });
  } catch (e) { 
    console.error('Erreur avis:', e);
    res.status(500).json({ error: 'Erreur' }); 
  }
});

app.get('/api/avis/approuves', async (req, res) => {
  try {
    const r = await pool.query('SELECT id, note, commentaire, date_creation FROM avis WHERE approuve = true ORDER BY date_creation DESC LIMIT 20');
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: 'Erreur' }); }
});

app.get('/api/admin/avis/stats', authenticateToken, isAdmin, async (req, res) => {
  try {
    const r = await pool.query("SELECT note, COUNT(*) as count FROM avis WHERE approuve = true GROUP BY note ORDER BY note ASC");
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: 'Erreur' }); }
});

app.get('/api/admin/avis', authenticateToken, isAdmin, async (req, res) => {
  try {
    const r = await pool.query('SELECT * FROM avis ORDER BY approuve ASC, date_creation DESC');
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: 'Erreur' }); }
});

app.put('/api/admin/avis/:id/approve', authenticateToken, isAdmin, async (req, res) => {
  try {
    await pool.query('UPDATE avis SET approuve = true WHERE id = $1', [req.params.id]);
    await logAction(req.user, 'Avis Approuve', 'ID: ' + req.params.id);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Erreur' }); }
});

app.delete('/api/admin/avis/:id', authenticateToken, isAdmin, async (req, res) => {
  try {
    await pool.query('DELETE FROM avis WHERE id = $1', [req.params.id]);
    await logAction(req.user, 'Avis Supprime', 'ID: ' + req.params.id);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Erreur' }); }
});

// ===== ROUTES SONDAGES =====
app.get('/api/sondage/actif', async (req, res) => {
  try {
    const r = await pool.query('SELECT * FROM sondages WHERE actif = true ORDER BY date_creation DESC LIMIT 1');
    if (r.rows.length === 0) return res.json({ sondage: null });
    res.json({ sondage: r.rows[0] });
  } catch (e) { res.status(500).json({ error: 'Erreur' }); }
});

app.post('/api/sondage/:id/vote', publicLimiter, async (req, res) => {
  const { option_index } = req.body;
  const sondageId = req.params.id;
  if (option_index === undefined || option_index === null) {
    return res.status(400).json({ error: 'Option requise.' });
  }

  // Hash de l'IP (pour éviter les votes multiples sans stocker l'IP)
  const ip = req.ip || req.connection.remoteAddress || '';
  const ipHash = crypto.createHash('sha256').update(ip + sondageId).digest('hex');

  try {
    // Vérifier si cette IP a déjà voté pour ce sondage
    const check = await pool.query('SELECT id FROM sondage_votes WHERE sondage_id = $1 AND ip_hash = $2', [sondageId, ipHash]);
    if (check.rows.length > 0) {
      return res.status(409).json({ error: 'Vous avez déjà voté pour ce sondage.' });
    }

    await pool.query('INSERT INTO sondage_votes (sondage_id, option_index, ip_hash) VALUES ($1, $2, $3)', [sondageId, option_index, ipHash]);
    res.json({ success: true });
  } catch (e) {
    console.error('Erreur vote:', e);
    res.status(500).json({ error: 'Erreur' });
  }
});

app.get('/api/sondage/:id/resultats', async (req, res) => {
  try {
    const sondage = await pool.query('SELECT * FROM sondages WHERE id = $1', [req.params.id]);
    if (sondage.rows.length === 0) return res.status(404).json({ error: 'Sondage introuvable' });
    
    const votes = await pool.query('SELECT option_index, COUNT(*) as count FROM sondage_votes WHERE sondage_id = $1 GROUP BY option_index ORDER BY option_index ASC', [req.params.id]);
    const results = votes.rows.map(v => ({ option_index: v.option_index, count: parseInt(v.count) }));
    res.json({ sondage: sondage.rows[0], results });
  } catch (e) { res.status(500).json({ error: 'Erreur' }); }
});

// ===== ROUTES ADMIN SONDAGES =====
app.get('/api/admin/sondages', authenticateToken, isAdmin, async (req, res) => {
  try {
    const r = await pool.query('SELECT * FROM sondages ORDER BY date_creation DESC');
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: 'Erreur' }); }
});

app.post('/api/admin/sondages', authenticateToken, isAdmin, async (req, res) => {
  const { question, options } = req.body;
  if (!question || !options || !Array.isArray(options) || options.length < 2) {
    return res.status(400).json({ error: 'Question et au moins 2 options requises.' });
  }
  try {
    // Désactiver les anciens sondages
    await pool.query('UPDATE sondages SET actif = false WHERE actif = true');
    // Créer le nouveau
    const r = await pool.query('INSERT INTO sondages (question, options, actif) VALUES ($1, $2, true) RETURNING *', [question, JSON.stringify(options)]);
    await logAction(req.user, 'Creation Sondage', question);
    res.json(r.rows[0]);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erreur' });
  }
});

app.delete('/api/admin/sondages/:id', authenticateToken, isAdmin, async (req, res) => {
  try {
    await pool.query('DELETE FROM sondages WHERE id = $1', [req.params.id]);
    await logAction(req.user, 'Suppression Sondage', 'ID: ' + req.params.id);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Erreur' }); }
});

app.put('/api/admin/sondages/:id/toggle', authenticateToken, isAdmin, async (req, res) => {
  try {
    const sondage = await pool.query('SELECT actif FROM sondages WHERE id = $1', [req.params.id]);
    if (sondage.rows.length === 0) return res.status(404).json({ error: 'Sondage introuvable' });
    
    const newState = !sondage.rows[0].actif;
    if (newState) {
      // Si on active, on désactive les autres
      await pool.query('UPDATE sondages SET actif = false WHERE actif = true');
    }
    await pool.query('UPDATE sondages SET actif = $1 WHERE id = $2', [newState, req.params.id]);
    await logAction(req.user, 'Toggle Sondage', `ID: ${req.params.id} -> ${newState ? 'ACTIF' : 'INACTIF'}`);
    res.json({ success: true, actif: newState });
  } catch (e) { res.status(500).json({ error: 'Erreur' }); }
});

app.get('/api/admin/sondages/:id/resultats', authenticateToken, isAdmin, async (req, res) => {
  try {
    const sondage = await pool.query('SELECT * FROM sondages WHERE id = $1', [req.params.id]);
    if (sondage.rows.length === 0) return res.status(404).json({ error: 'Sondage introuvable' });
    
    const votes = await pool.query('SELECT option_index, COUNT(*) as count FROM sondage_votes WHERE sondage_id = $1 GROUP BY option_index ORDER BY option_index ASC', [req.params.id]);
    const results = votes.rows.map(v => ({ option_index: v.option_index, count: parseInt(v.count) }));
    res.json({ sondage: sondage.rows[0], results });
  } catch (e) { res.status(500).json({ error: 'Erreur' }); }
});

// ===== ROUTES ADMIN DIVERSES =====
app.get('/api/utilisateurs', authenticateToken, isAdmin, async (req, res) => { 
  try { 
    const r = await pool.query('SELECT id,name,role FROM utilisateurs'); 
    res.json(r.rows); 
  } catch (e) { res.status(500).json({ error: 'Erreur' }); } 
});

app.post('/api/utilisateurs', authenticateToken, isAdmin, async (req, res) => { 
  const { name, password, role } = req.body; 
  try { 
    const hashed = await require('bcryptjs').hash(password, 10); 
    const r = await pool.query('INSERT INTO utilisateurs (name,password,role) VALUES ($1,$2,$3) RETURNING *', [name,hashed, role]); 
    await logAction(req.user, 'Creation Personnel', name); 
    res.json(r.rows[0]); 
  } catch (e) { res.status(500).json({ error: 'Erreur' }); } 
});

app.delete('/api/utilisateurs/:id', authenticateToken, isAdmin, async (req, res) => { 
  try { 
    await pool.query('DELETE FROM utilisateurs WHERE id=$1', [req.params.id]); 
    await logAction(req.user, 'Suppression Personnel', `ID: ${req.params.id}`); 
    res.json({ success: true }); 
  } catch (e) { res.status(500).json({ error: 'Erreur' }); } 
});

app.get('/api/promo/public', async (req, res) => { try { const r = await pool.query("SELECT code, pourcentage FROM codes_promo WHERE actif = true"); res.json(r.rows); } catch (e) { res.status(500).json({ error: 'Erreur' }); } });
app.post('/api/promo/check', async (req, res) => { 
  const { code } = req.body; 
  try { 
    const r = await pool.query('SELECT * FROM codes_promo WHERE UPPER(code) = UPPER($1) AND actif = true', [code]); 
    if (r.rows.length === 0) return res.status(404).json({ error: 'Invalide' }); 
    res.json({ success: true, pourcentage: r.rows[0].pourcentage }); 
  } catch (e) { res.status(500).json({ error: 'Erreur' }); } 
});

app.get('/api/promo', authenticateToken, isAdmin, async (req, res) => { 
  try { 
    const r = await pool.query('SELECT * FROM codes_promo ORDER BY created_at DESC'); 
    res.json(r.rows); 
  } catch (e) { res.status(500).json({ error: 'Erreur' }); }
});

app.post('/api/promo', authenticateToken, isAdmin, async (req, res) => { 
  const { code, pourcentage } = req.body; 
  try { 
    const r = await pool.query('INSERT INTO codes_promo (code, pourcentage) VALUES ($1, $2) RETURNING *', [code.toUpperCase(), pourcentage]); 
    await logAction(req.user, 'Creation Promo', code); 
    res.json(r.rows[0]); 
  } catch (e) { res.status(500).json({ error: "Existe déjà" }); } 
});

app.delete('/api/promo/:id', authenticateToken, isAdmin, async (req, res) => { 
  try { 
    await pool.query('DELETE FROM codes_promo WHERE id=$1', [req.params.id]); 
    res.json({ success: true }); 
  } catch (e) { res.status(500).json({ error: 'Erreur' }); } 
});

app.get('/api/admin/export-commandes', authenticateToken, isAdmin, async (req, res) => { 
  try { const c = await pool.query(`SELECT c.*, COALESCE(NULLIF(cl.nom, ''), 'Client ' || cl.telephone) as client_nom FROM commandes c LEFT JOIN clients cl ON c.client_id = cl.id`); const i = await pool.query('SELECT * FROM commande_items'); res.json({ date: new Date(), commandes: c.rows, items: i.rows }); } catch (e) { res.status(500).json({ error: 'Erreur' }); } 
});

app.get('/api/admin/export-logs', authenticateToken, isAdmin, async (req, res) => { 
  try { const r = await pool.query('SELECT * FROM logs_activite ORDER BY date_log DESC'); res.json(r.rows); } catch (e) { res.status(500).json({ error: 'Erreur' }); } 
});

app.get('/api/admin/export-security', authenticateToken, isAdmin, async (req, res) => { 
  try { const r = await pool.query("SELECT * FROM logs_activite WHERE action LIKE '%Connexion%' AND details LIKE '%Echouee%'"); res.json({ tentatives:r.rows }); } catch (e) { res.status(500).json({ error: 'Erreur' }); } 
});

app.post('/api/admin/reset-commandes', authenticateToken, isAdmin, async (req, res) => { 
  try { const c = await pool.query('SELECT * FROM commandes'); const i = await pool.query('SELECT * FROM commande_items'); await pool.query('INSERT INTO backup_commandes (data) VALUES ($1)', [{ date: new Date(), commandes: c.rows, items: i.rows }]); await pool.query('TRUNCATE TABLE commande_items, commandes RESTART IDENTITY CASCADE'); await logAction(req.user, 'Reset Commandes', 'Sauvegarde OK'); res.json({ success: true, message: "Commandes sauvegardées et réinitialisées." }); } catch (e) { res.status(500).json({ error: 'Erreur' }); } 
});

app.get('/api/security/analyse', authenticateToken, isAdmin, async (req, res) => { 
  try { const f = await pool.query("SELECT * FROM logs_activite WHERE action LIKE '%Connexion%' AND details LIKE '%Echouee%' ORDER BY date_log DESC LIMIT 20"); const t = await pool.query("SELECT COUNT(*) FROM logs_activite WHERE action LIKE '%Connexion%' AND details LIKE '%Echouee%'"); res.json({ failedLogins: f.rows, totalAttacks: parseInt(t.rows[0].count), isLockdown }); } catch (e) { res.status(500).json({ error: 'Erreur' }); } 
});

app.post('/api/admin/security/toggle-lockdown', authenticateToken, isAdmin, async (req, res) => {
  isLockdown = !isLockdown;
  await pool.query("UPDATE settings SET value = $1 WHERE key = 'lockdown'", [isLockdown.toString()]);
  await logAction(req.user, 'Lockdown', isLockdown ? 'ACTIVÉ' : 'DÉSACTIVÉ');
  res.json({ success: true, lockdown: isLockdown });
});

app.post('/api/admin/security/simulate-attack', authenticateToken, isAdmin, async (req, res) => { await logAction({name: 'PIRATE', role: 'inconnu'}, 'Intrusion', 'Simulation'); res.json({ success: true }); });

app.post('/api/admin/security/backup-wipe', authenticateToken, isAdmin, async (req, res) => { 
  try { const b = { date: new Date(), clients: (await pool.query('SELECT * FROM clients')).rows, commandes: (await pool.query('SELECT * FROM commandes')).rows }; await pool.query('INSERT INTO backup_commandes (data) VALUES ($1)', [b]); await pool.query('TRUNCATE TABLE commande_items, commandes, clients, saveurs RESTART IDENTITY CASCADE'); await logAction(req.user, 'Zero-Day', 'Wipeeffectué'); res.json({ success: true, message: 'Sauvegardé et nettoyé.' }); } catch (e) { res.status(500).json({ error:'Erreur' }); } 
});

app.get('/api/logs', authenticateToken, isAdmin, async (req, res) => { 
  try { const r = await pool.query('SELECT * FROM logs_activite ORDER BY date_log DESC LIMIT 200'); res.json(r.rows); } catch (e) { res.status(500).json({ error: 'Erreur' }); } 
});

app.get('/api/admin/maintenance', authenticateToken, isAdmin, async (req, res) => {
  try {
    const r = await pool.query("SELECT value FROM settings WHERE key = 'maintenance_mode' LIMIT 1");
    const enabled = r.rows.length > 0 && r.rows[0].value === 'true';
    res.json({ enabled });
  } catch (e) {
    res.status(500).json({ error: 'Erreur' });
  }
});

app.post('/api/admin/maintenance', authenticateToken, isAdmin, async (req, res) => {
  try {
    const enabled = !!(req.body && req.body.enabled);
    await pool.query(
      "INSERT INTO settings (key, value) VALUES ('maintenance_mode', $1) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value",
      [enabled ? 'true' : 'false']
    );
    _maintenanceCache = { value: enabled, timestamp: Date.now() };
    await logAction(req.user, 'Mode Maintenance', enabled ? 'ACTIVE' : 'DESACTIVE');
    res.json({ success: true, enabled });
  } catch (e) {
    console.error('Maintenance toggle error:', e);
    res.status(500).json({ error: 'Erreur' });
  }
});

app.get('/api/health', async (req, res) => { try { await pool.query('SELECT 1'); res.json({ status: 'ok' }); } catch(e) { res.status(500).json({ status: 'error' }); } });


// ===== ROUTES BANISSEMENT =====
app.put('/api/admin/clients/:id/ban', authenticateToken, isAdmin, async (req, res) => {
  const { reason } = req.body;
  try {
    await pool.query('UPDATE clients SET is_banned = true, ban_reason = $1 WHERE id = $2', [reason || 'Aucune raison specifiee', req.params.id]);
    await logAction(req.user, 'Bannissement Client', `ID: ${req.params.id} - Raison: ${reason || 'Non specifiee'}`);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Erreur' }); }
});

app.put('/api/admin/clients/:id/unban', authenticateToken, isAdmin, async (req, res) => {
  try {
    await pool.query('UPDATE clients SET is_banned = false, ban_reason = NULL WHERE id = $1', [req.params.id]);
    await logAction(req.user, 'Debannissement Client', `ID: ${req.params.id}`);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Erreur' }); }
});
// ==============================

app.get('*', (req, res) => { res.sendFile(path.join(__dirname, 'public', 'index.html')); });
app.listen(PORT, () => console.log(`🚀 Serveur sur port ${PORT}`));