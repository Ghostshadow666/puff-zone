const { Pool } = require('pg');
require('dotenv').config();
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

const alterTable = async () => {
  try {
    await pool.query('ALTER TABLE produits ADD COLUMN IF NOT EXISTS image_url TEXT;');
    console.log("✅ Colonne image_url ajoutée à la table produits !");
  } catch (err) {
    console.error("❌ Erreur :", err);
  } finally {
    pool.end();
  }
};
alterTable();
