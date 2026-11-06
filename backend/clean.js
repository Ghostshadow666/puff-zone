require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function clean() {
    try {
        console.log("Nettoyage en force de la base de données...");
        // Supprime toutes les catégories dont le nom contient 'class=' ou des guillemets
        const res = await pool.query(`
            DELETE FROM categories 
            WHERE nom LIKE '%class=%' OR nom LIKE '%&quot;%' OR nom LIKE '%"%' OR nom LIKE '%<%'
            RETURNING id, nom;
        `);
        if (res.rowCount > 0) {
            console.log(`✅ ${res.rowCount} catégorie(s) corrompue(s) supprimée(s) :`);
            res.rows.forEach(r => console.log(` - ID ${r.id} : "${r.nom}"`));
        } else {
            console.log("ℹ️ Aucune catégorie corrompue trouvée dans la base.");
        }
    } catch (e) {
        console.error("Erreur:", e.message);
    } finally {
        process.exit(0);
    }
}
clean();