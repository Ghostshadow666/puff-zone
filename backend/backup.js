require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = new Pool({ 
    connectionString: process.env.DATABASE_URL, 
    ssl: { rejectUnauthorized: false } 
});

async function runBackup() {
    try {
        console.log("📥 Connexion à la base de données Railway...");
        
        // Liste des tables à sauvegarder
        const tables = [
            'utilisateurs', 'clients', 'commandes', 'commande_items', 
            'categories', 'saveurs', 'codes_promo', 'zones', 'settings', 'logs_activite'
        ];
        
        const backupData = {};

        for (const table of tables) {
            console.log(`⏳ Sauvegarde de la table : ${table}...`);
            const res = await pool.query(`SELECT * FROM ${table}`);
            backupData[table] = res.rows;
        }

        // Création du dossier "backups" s'il n'existe pas
        const dir = path.join(__dirname, 'backups');
        if (!fs.existsSync(dir)){
            fs.mkdirSync(dir);
        }

        // Nom du fichier avec la date (ex: backup_2026-11-06_16-30-00.json)
        const dateStr = new Date().toISOString().replace(/T/, '_').replace(/\..+/, '').replace(/:/g, '-');
        const fileName = `backup_${dateStr}.json`;
        const filePath = path.join(dir, fileName);

        fs.writeFileSync(filePath, JSON.stringify(backupData, null, 2));
        
        console.log(`\n✅ Sauvegarde réussie !`);
        console.log(`📁 Fichier créé : ${filePath}`);
        console.log(`Total : ${Object.keys(backupData).length} tables sauvegardées.`);
        
    } catch (e) {
        console.error("❌ Erreur lors de la sauvegarde :", e.message);
    } finally {
        process.exit(0);
    }
}

runBackup();