const { Pool } = require('pg');
require('dotenv').config();
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

const createTables = async () => {
  const queryText = `
    -- On supprime l'ancienne table produits pour repartir sur de bonnes bases
    DROP TABLE IF EXISTS produits CASCADE;

    -- Table des catégories (ex: 10k, 18k)
    CREATE TABLE IF NOT EXISTS categories (
      id SERIAL PRIMARY KEY,
      nom VARCHAR(100) NOT NULL UNIQUE,
      image_url TEXT,
      prix_unite DECIMAL(10,2) DEFAULT 0,
      prix_lot_5 DECIMAL(10,2) DEFAULT 0,
      prix_lot_10 DECIMAL(10,2) DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    -- Table des saveurs (liée à une catégorie)
    CREATE TABLE IF NOT EXISTS saveurs (
      id SERIAL PRIMARY KEY,
      categorie_id INTEGER REFERENCES categories(id) ON DELETE CASCADE,
      nom VARCHAR(100) NOT NULL,
      stock INTEGER DEFAULT 0,
      prix_achat DECIMAL(10,2) DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `;
  try {
    await pool.query(queryText);
    console.log("✅ Tables 'categories' et 'saveurs' créées avec succès !");
  } catch (err) {
    console.error("❌ Erreur :", err);
  } finally {
    pool.end();
  }
};
createTables();
