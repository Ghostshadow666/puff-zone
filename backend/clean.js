require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function clean() {
    try {
        console.log("Recherche des catégories corrompues...");
        const res = await pool.query(`
            DELETE FROM categories 
            WHERE nom LIKE '%class=%' OR nom LIKE '%&quot;%' OR nom LIKE '%<%'
            RETURNING id, nom;
        `);
        console.log(`✅ ${res.rowCount} catégorie(s) corrompue(s) supprimée(s) avec succès !`);
        console.log("Tu peux rafraîchir ton admin.");
    } catch (e) {
        console.error("Erreur:", e.message);
    } finally {
        process.exit(0);
    }
}
clean();