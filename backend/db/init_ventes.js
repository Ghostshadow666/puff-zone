const { Pool } = require('pg');
require('dotenv').config();
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

const createTable = async () => {
  const queryText = `
    CREATE TABLE IF NOT EXISTS ventes (
      id SERIAL PRIMARY KEY,
      client_nom VARCHAR(100),
      categorie_nom VARCHAR(100),
      saveur_nom VARCHAR(100),
      quantite INTEGER,
      prix_vente_total DECIMAL(10,2),
      prix_achat_total DECIMAL(10,2),
      date_vente TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `;
  try {
    await pool.query(queryText);
    console.log("✅ Table 'ventes' créée avec succès !");
  } catch (err) {
    console.error("❌ Erreur :", err);
  } finally {
    pool.end();
  }
};
createTable();
