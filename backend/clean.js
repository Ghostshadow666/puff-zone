require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function clean() {
    try {
        console.log("🔍 Analyse des catégories en base de données...");
        
        // On affiche toutes les catégories pour voir ce qu'il y a
        const all = await pool.query('SELECT id, nom FROM categories ORDER BY id ASC');
        console.log("Voici tes catégories actuelles :");
        all.rows.forEach(r => console.log(` - ID: ${r.id} | Nom: "${r.nom}"`));

        console.log("\n🧹 Suppression des catégories corrompues (qui contiennent du code HTML)...");
        
        // On supprime SEULEMENT celles qui contiennent 'class=' ou '<' ou '&quot;'
        const res = await pool.query(`
            DELETE FROM categories 
            WHERE nom LIKE '%class=%' OR nom LIKE '%<%' OR nom LIKE '%&quot;%'
            RETURNING id, nom;
        `);

        if (res.rowCount > 0) {
            console.log(`✅ ${res.rowCount} catégorie(s) corrompue(s) supprimée(s) :`);
            res.rows.forEach(r => console.log(` - ID ${r.id} : "${r.nom}"`));
        } else {
            console.log("ℹ️ Aucune catégorie corrompue trouvée. (Peut-être que tu l'as déjà supprimée ?)");
        }
        
        console.log("\n✅ Tes autres catégories sont intactes !");
    } catch (e) {
        console.error("Erreur:", e.message);
    } finally {
        process.exit(0);
    }
}
clean();