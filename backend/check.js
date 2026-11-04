const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function check() {
    try {
        const res = await pool.query('SELECT id, name, password, role FROM utilisateurs');
        console.log("--- LISTE DES UTILISATEURS ---");
        for (const row of res.rows) {
            console.log(`Nom: ${row.name} | Rôle: ${row.role}`);
            if (row.name === 'Admin1') {
                const isMatch = await bcrypt.compare('admin123', row.password);
                console.log(`  -> Le mot de passe 'admin123' correspond-il ? ${isMatch ? '✅ OUI' : '❌ NON'}`);
                console.log(`  -> Hash en base : ${row.password.substring(0, 20)}...`);
            }
        }
    } catch (err) {
        console.error("Erreur :", err.message);
    } finally {
        pool.end();
    }
}
check();