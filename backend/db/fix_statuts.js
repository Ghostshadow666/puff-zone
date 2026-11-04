const { Pool } = require('pg');
require('dotenv').config();
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

const fixStatuts = async () => {
  try {
    // On force tous les statuts qui contiennent "livr" à devenir exactement "livre"
    await pool.query("UPDATE commandes SET statut = 'livre' WHERE statut LIKE '%livr%'");
    console.log("✅ Tous les statuts ont été corrigés en 'livre' !");
  } catch (err) {
    console.error("❌ Erreur :", err);
  } finally {
    pool.end();
  }
};
fixStatuts();