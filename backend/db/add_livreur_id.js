const { Pool } = require('pg');
require('dotenv').config();
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

const alterTable = async () => {
  try {
    await pool.query('ALTER TABLE commandes ADD COLUMN IF NOT EXISTS livreur_id INTEGER REFERENCES utilisateurs(id);');
    console.log("✅ Colonne livreur_id ajoutée à la table commandes !");
  } catch (err) {
    console.error("❌ Erreur :", err);
  } finally {
    pool.end();
  }
};
alterTable();