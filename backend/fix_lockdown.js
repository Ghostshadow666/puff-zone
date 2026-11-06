const fs = require('fs');
let content = fs.readFileSync('server.js', 'utf8');

// 1. Initialisation de la table settings au démarrage
const initTarget = "await pool.query(\"INSERT INTO settings (key, value) VALUES ('banner_text', 'LIVRAISON SPATIALE RAPIDE 24/48H EN FRANCE & BELGIQUE') ON CONFLICT (key) DO NOTHING\");";
const initReplace = initTarget + `

    await pool.query("INSERT INTO settings (key, value) VALUES ('lockdown', 'false') ON CONFLICT (key) DO NOTHING");
    const lockRes = await pool.query("SELECT value FROM settings WHERE key = 'lockdown'");
    isLockdown = lockRes.rows[0].value === 'true';
    `;
content = content.replace(initTarget, initReplace);

// 2. Mise à jour de la route toggle-lockdown
const toggleTarget = "app.post('/api/admin/security/toggle-lockdown', authenticateToken, isAdmin, async (req, res) => { isLockdown = !isLockdown; await logAction(req.user, 'Lockdown', isLockdown ? 'ACTIVÉ' : 'DÉSACTIVÉ'); res.json({ success: true, lockdown: isLockdown }); });";
const toggleReplace = `app.post('/api/admin/security/toggle-lockdown', authenticateToken, isAdmin, async (req, res) => {
  isLockdown = !isLockdown;
  await pool.query("UPDATE settings SET value = $1 WHERE key = 'lockdown'", [isLockdown.toString()]);
  await logAction(req.user, 'Lockdown', isLockdown ? 'ACTIVÉ' : 'DÉSACTIVÉ');
  res.json({ success: true, lockdown: isLockdown });
});`;
content = content.replace(toggleTarget, toggleReplace);

fs.writeFileSync('server.js', content, 'utf8');
console.log("✅ Le Lockdown est maintenant sauvegardé en base de données !");
