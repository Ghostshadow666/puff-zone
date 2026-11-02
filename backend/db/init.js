const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const createTables = async () => {
  const queryText = `
    CREATE TABLE IF NOT EXISTS livreurs (
      id SERIAL PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      see_client_phone BOOLEAN DEFAULT true,
      active BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS zones (
      id SERIAL PRIMARY KEY,
      nom VARCHAR(100) NOT NULL,
      lat DOUBLE PRECISION NOT NULL,
      lng DOUBLE PRECISION NOT NULL,
      rayon INTEGER NOT NULL,
      min_commande INTEGER NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS produits (
      id SERIAL PRIMARY KEY,
      modele VARCHAR(100) NOT NULL,
      saveur VARCHAR(100) NOT NULL,
      categorie VARCHAR(50),
      stock INTEGER DEFAULT 0,
      prix_achat DECIMAL(10,2) DEFAULT 0,
      prix_vente DECIMAL(10,2) DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `;
  try {
    await pool.query(queryText);
    console.log("✅ Tables Livreurs, Zones et Produits créées avec succès !");
  } catch (err) {
    console.error("❌ Erreur lors de la création des tables :", err);
  } finally {
    pool.end();
  }
};
createTables();
