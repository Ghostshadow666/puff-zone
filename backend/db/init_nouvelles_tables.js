const { Pool } = require('pg');
require('dotenv').config();
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

const createTables = async () => {
  try {
    console.log("⏳ Création des tables en cours...");

    // 1. Table Utilisateurs (Staff : Admin, Vendeur, Livreur)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS utilisateurs (
        id SERIAL PRIMARY KEY, 
        name VARCHAR(100) UNIQUE NOT NULL, 
        password VARCHAR(255) NOT NULL, 
        role VARCHAR(50) NOT NULL, 
        see_client_phone BOOLEAN DEFAULT true, 
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 2. Table Clients (Site)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS clients (
        id SERIAL PRIMARY KEY, 
        telephone VARCHAR(50) UNIQUE NOT NULL, 
        nom VARCHAR(100), 
        adresse TEXT, 
        whatsapp VARCHAR(50), 
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 3. Table Commandes
    await pool.query(`
      CREATE TABLE IF NOT EXISTS commandes (
        id SERIAL PRIMARY KEY, 
        client_id INTEGER REFERENCES clients(id), 
        total DECIMAL(10,2), 
        statut VARCHAR(50) DEFAULT 'en_attente', 
        date_commande TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 4. Table Commande Items (Détail des produits commandés)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS commande_items (
        id SERIAL PRIMARY KEY, 
        commande_id INTEGER REFERENCES commandes(id) ON DELETE CASCADE, 
        saveur_nom VARCHAR(100), 
        quantite INTEGER, 
        prix DECIMAL(10,2)
      );
    `);

    // Ajout d'un admin par défaut si la table est vide (pour ne pas être bloqué)
    const res = await pool.query('SELECT COUNT(*) FROM utilisateurs');
    if (parseInt(res.rows[0].count) === 0) {
      await pool.query("INSERT INTO utilisateurs (name, password, role) VALUES ('admin', 'admin', 'admin')");
      console.log("✅ Admin par défaut créé (admin / admin)");
    }

    console.log("✅ TOUTES LES TABLES SONT CRÉÉES !");
  } catch (err) {
    console.error("❌ Erreur :", err);
  } finally {
    pool.end();
  }
};

createTables();
