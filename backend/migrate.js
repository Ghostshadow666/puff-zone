const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL || "TON_URL_POSTGRES_RAILWAY_ICI", // Si tu l'as en local
    ssl: { rejectUnauthorized: false }
});

async function migrate() {
    console.log("Début de la migration des mots de passe...");
    try {
        const res = await pool.query('SELECT id, email, password FROM users');
        for (let row of res.rows) {
            // Si le mot de passe ne commence pas par $2a$ ou $2b$, c'est qu'il est en clair
            if (row.password && !row.password.startsWith('$2')) {
                const salt = await bcrypt.genSalt(10);
                const hashed = await bcrypt.hash(row.password, salt);
                await pool.query('UPDATE users SET password = $1 WHERE id = $2', [hashed, row.id]);
                console.log(`✅ Mot de passe hashé pour : ${row.email}`);
            } else {
                console.log(`⏩ Déjà hashé : ${row.email}`);
            }
        }
        console.log("🎉 Migration terminée !");
    } catch (err) {
        console.error("Erreur :", err.message);
    } finally {
        pool.end();
    }
}
migrate();