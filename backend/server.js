require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { Pool } = require('pg');
const { authenticateToken, isAdmin, hashPassword, checkPassword, generateToken } = require('./auth');

const app = express();
const PORT = process.env.PORT || 5000;

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

app.use(cors());
app.use(express.json({ limit: '50mb' }));
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

// --- AUTHENTIFICATION (CLIENTS & ADMIN) ---
app.post('/api/register', async (req, res) => {
    const { email, password, name } = req.body;
    try {
        const userExists = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
        if (userExists.rows.length > 0) return res.status(400).json({ message: "Email dÃƒÂ©jÃƒÂ  utilisÃƒÂ©." });
        const hashedPassword = await hashPassword(password);
        const newUser = await pool.query(
            'INSERT INTO users (email, password, name, role) VALUES ($1, $2, $3, $4) RETURNING id, email, name, role',
            [email, hashedPassword, name, 'client']
        );
        res.status(201).json(newUser.rows[0]);
    } catch (err) {
        res.status(500).json({ message: "Erreur inscription." });
    }
});

app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const userResult = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
        if (userResult.rows.length === 0) return res.status(401).json({ message: "Email ou mot de passe incorrect." });
        const user = userResult.rows[0];
        const validPassword = await checkPassword(password, user.password);
        if (!validPassword) return res.status(401).json({ message: "Email ou mot de passe incorrect." });
        const token = generateToken(user);
        res.json({ token, user: { id: user.id, email: user.email, name: user.name, role: user.role } });
    } catch (err) {
        res.status(500).json({ message: "Erreur connexion." });
    }
});

app.get('/api/me', authenticateToken, async (req, res) => {
    try {
        const userResult = await pool.query('SELECT id, email, name, role FROM users WHERE id = $1', [req.user.id]);
        res.json(userResult.rows[0]);
    } catch (err) {
        res.status(500).json({ message: "Erreur serveur." });
    }
});

// --- CLIENTS ---
app.post('/api/clients/login', async (req, res) => {
    const { telephone, nom, adresse, whatsapp } = req.body;
    try {
        let r = await pool.query('SELECT * FROM clients WHERE telephone = $1', [telephone]);
        if (r.rows.length === 0) {
            r = await pool.query('INSERT INTO clients (telephone, nom, adresse, whatsapp) VALUES ($1,$2,$3,$4) RETURNING *', [telephone, nom, adresse, whatsapp]);
        } else {
            await pool.query('UPDATE clients SET nom=$1, adresse=$2, whatsapp=$3 WHERE telephone=$4', [nom, adresse, whatsapp, telephone]);
            r = await pool.query('SELECT * FROM clients WHERE telephone = $1', [telephone]);
        }
        res.json({ success: true, client: r.rows[0] });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.put('/api/clients/:id', authenticateToken, async (req, res) => {
    const { nom, adresse, whatsapp } = req.body;
    try {
        const r = await pool.query('UPDATE clients SET nom=$1, adresse=$2, whatsapp=$3 WHERE id=$4 RETURNING *', [nom, adresse, whatsapp, req.params.id]);
        res.json({ success: true, client: r.rows[0] });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/clients', authenticateToken, isAdmin, async (req, res) => {
    try {
        const r = await pool.query('SELECT * FROM clients ORDER BY created_at DESC');
        res.json(r.rows);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// --- COMMANDES ---
app.post('/api/commandes', async (req, res) => {
    const { client_id, cart, total } = req.body;
    try {
        const cmd = await pool.query('INSERT INTO commandes (client_id, total) VALUES ($1,$2) RETURNING *', [client_id, total]);
        // ... (suite de la logique commande inchangÃƒÂ©e)
        res.json(cmd.rows[0]);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ... (ajoute ici toutes tes autres routes existantes : stock, ventes, etc.)
// N'oublie pas d'ajouter authenticateToken (et isAdmin si besoin) sur les routes sensibles.

// --- FALLBACK SPA ---
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public/index.html'));
});

app.listen(PORT, () => console.log(`Serveur PUFF ZONE dÃƒÂ©marrÃƒÂ© sur le port ${PORT}`));
