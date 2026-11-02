const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const cookieParser = require('cookie-parser');
const multer = require('multer');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(cookieParser());
app.use(express.static('public'));

const storage = multer.diskStorage({
    destination: (req, file, cb) => { cb(null, 'public/uploads/'); },
    filename: (req, file, cb) => { cb(null, Date.now() + '-' + file.originalname.replace(/\s/g, '_')); }
});
const upload = multer({ storage });

const db = new sqlite3.Database('./database.sqlite');

db.serialize(() => {
    // On garde la structure existante mais on ajoute un champ pour le prix de la catégorie
    db.run(`CREATE TABLE IF NOT EXISTS categories (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, image_url TEXT, base_price REAL DEFAULT 0)`);
    db.run(`CREATE TABLE IF NOT EXISTS products (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, price REAL, stock INTEGER, category TEXT, packs TEXT, flavors TEXT, image_url TEXT)`);
    
    // Ajout de la colonne base_price si elle n'existe pas
    db.all("PRAGMA table_info(categories)", (err, columns) => {
        if (!columns.some(c => c.name === 'base_price')) {
            db.run(`ALTER TABLE categories ADD COLUMN base_price REAL DEFAULT 0`);
        }
    });
});

app.post('/api/upload', upload.single('image'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'Aucun fichier' });
    res.json({ url: '/uploads/' + req.file.filename });
});

app.get('/api/announcements', (req, res) => { db.all(`SELECT * FROM announcements WHERE is_active = 1`, [], (err, rows) => { res.json(rows); }); });
app.get('/api/categories', (req, res) => { db.all(`SELECT * FROM categories`, [], (err, rows) => { res.json(rows); }); });
app.get('/api/products', (req, res) => {
    db.all(`SELECT * FROM products`, [], (err, rows) => {
        rows = rows.map(r => ({ ...r, flavors: JSON.parse(r.flavors || '[]') }));
        res.json(rows);
    });
});

app.post('/api/login-client', (req, res) => {
    const { phone } = req.body;
    db.get(`SELECT * FROM users WHERE phone = ?`, [phone], (err, user) => {
        if (!user) { db.run(`INSERT INTO users (phone) VALUES (?)`, [phone]); return res.json({ phone, isNew: true }); }
        res.json(user);
    });
});
app.post('/api/update-client', (req, res) => {
    const { phone, name, address, whatsapp } = req.body;
    db.run(`UPDATE users SET name = ?, address = ?, whatsapp = ? WHERE phone = ?`, [name, address, whatsapp, phone], () => { res.json({ success: true, user: { phone, name, address, whatsapp } }); });
});
app.post('/api/order', (req, res) => {
    const { phone, items } = req.body; 
    const date = new Date().toISOString();
    const order_ref = 'CMD-' + Date.now().toString().slice(-6); 
    db.serialize(() => {
        const stmt = db.prepare(`INSERT INTO orders (order_ref, phone, product, flavor, price, qty, date, status) VALUES (?, ?, ?, ?, ?, ?, ?, 'En attente')`);
        items.forEach(item => {
            stmt.run(order_ref, phone, item.product, item.flavor, item.price, item.qty, date);
            db.run(`UPDATE products SET stock = stock - ? WHERE name = ? AND stock >= ?`, [item.qty, item.product, item.qty]);
        });
        stmt.finalize();
        res.json({ success: true, order_ref });
    });
});
app.get('/api/client/orders/:phone', (req, res) => { db.all(`SELECT * FROM orders WHERE phone = ? ORDER BY id DESC`, [req.params.phone], (err, rows) => { res.json(rows); }); });

// --- ROUTES ADMIN ---
app.post('/api/admin/login', (req, res) => {
    const { username, password } = req.body;
    db.get(`SELECT * FROM admins WHERE username = ?`, [username], (err, admin) => {
        if (!admin || !bcrypt.compareSync(password, admin.password)) return res.status(401).json({ error: 'Identifiants incorrects' });
        res.cookie('adminRole', admin.role, { httpOnly: true });
        res.cookie('adminUser', admin.username, { httpOnly: true });
        res.json({ success: true, role: admin.role, username: admin.username });
    });
});
const checkAdmin = (req, res, next) => { if (!req.cookies.adminRole) return res.status(403).json({ error: 'Non autorisé' }); next(); };
app.get('/api/admin/check', checkAdmin, (req, res) => { res.json({ loggedIn: true, role: req.cookies.adminRole, username: req.cookies.adminUser }); });
app.post('/api/admin/logout', (req, res) => { res.clearCookie('adminRole'); res.clearCookie('adminUser'); res.json({ success: true }); });

app.post('/api/admin/create-user', checkAdmin, (req, res) => {
    const { username, password, whatsapp, role } = req.body;
    const myRole = req.cookies.adminRole;
    if (myRole !== 'dev' && (myRole !== 'manager' || role !== 'vendor')) return res.status(403).json({ error: 'Droits insuffisants' });
    const hash = bcrypt.hashSync(password, 10);
    db.run(`INSERT INTO admins (username, password, role, whatsapp) VALUES (?, ?, ?, ?)`, [username, hash, role, whatsapp], (err) => {
        if(err) return res.status(400).json({ error: 'Pseudo déjà pris' });
        res.json({ success: true });
    });
});

app.post('/api/admin/reset', checkAdmin, (req, res) => {
    if (req.cookies.adminRole !== 'dev') return res.status(403).json({ error: 'Réservé au Dev' });
    db.run(`DELETE FROM orders`, () => { res.json({ success: true }); });
});

app.get('/api/admin/stats', checkAdmin, (req, res) => {
    db.get(`SELECT SUM(price * qty) as total FROM orders WHERE status IN ('Validée', 'En livraison', 'Livrée')`, (err, rowValid) => {
        db.get(`SELECT SUM(price * qty) as total FROM orders WHERE status = 'En attente'`, (err, rowPending) => {
            db.get(`SELECT product, SUM(qty) as qty FROM orders WHERE status IN ('Validée', 'En livraison', 'Livrée') GROUP BY product ORDER BY qty DESC LIMIT 1`, (err, best) => {
                res.json({ totalValid: rowValid.total || 0, totalPending: rowPending.total || 0, bestSeller: best ? best.product : 'Aucun' });
            });
        });
    });
});

app.get('/api/admin/orders', checkAdmin, (req, res) => {
    db.all(`SELECT o.order_ref, o.phone, u.name as clientName, u.whatsapp, o.date, o.status, 
            GROUP_CONCAT(o.qty || 'x ' || o.product || ' (' || o.flavor || ')', ', ') as items,
            SUM(o.price * o.qty) as total
            FROM orders o LEFT JOIN users u ON o.phone = u.phone GROUP BY o.order_ref ORDER BY o.id DESC`, [], (err, rows) => { res.json(rows); });
});
app.post('/api/admin/update-status', checkAdmin, (req, res) => {
    const { order_ref, status } = req.body;
    db.run(`UPDATE orders SET status = ? WHERE order_ref = ?`, [status, order_ref], () => { res.json({ success: true }); });
});

// MISE A JOUR DES PRODUITS ET CATEGORIES
app.post('/api/admin/products', checkAdmin, (req, res) => {
    const products = req.body;
    db.run(`DELETE FROM products`, () => {
        const stmt = db.prepare(`INSERT INTO products (name, price, stock, category, packs, flavors, image_url) VALUES (?, ?, ?, ?, ?, ?, ?)`);
        products.forEach(p => { stmt.run(p.name, p.price, p.stock, p.category, p.packs, JSON.stringify(p.flavors), p.image_url || ''); });
        stmt.finalize();
        res.json({ success: true });
    });
});
app.post('/api/admin/categories', checkAdmin, (req, res) => {
    const cats = req.body;
    db.run(`DELETE FROM categories`, () => {
        const stmt = db.prepare(`INSERT INTO categories (name, image_url, base_price) VALUES (?, ?, ?)`);
        cats.forEach(c => { stmt.run(c.name, c.image_url, c.base_price || 0); });
        stmt.finalize();
        res.json({ success: true });
    });
});
app.post('/api/admin/announcements', checkAdmin, (req, res) => {
    const anns = req.body;
    db.run(`DELETE FROM announcements`, () => {
        const stmt = db.prepare(`INSERT INTO announcements (text, is_active) VALUES (?, ?)`);
        anns.forEach(a => { stmt.run(a.text, a.is_active ? 1 : 0); });
        stmt.finalize();
        res.json({ success: true });
    });
});

app.listen(PORT, () => console.log(`✅ Serveur prêt sur http://localhost:${PORT}`));
