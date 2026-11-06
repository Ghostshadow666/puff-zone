require('dotenv').config();
const fs = require('fs');
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

// Fonction pour parser un fichier CSV basique (Nom, Telephone, Adresse, Whatsapp)
async function importCSV(filePath) {
    console.log("Début de l'importation CSV...");
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    
    for (let i = 1; i < lines.length; i++) { // On saute la première ligne (en-têtes)
        const line = lines[i].trim();
        if (!line) continue;
        
        // Séparation par point-virgule ou virgule
        const cols = line.split(/[;,]/); 
        if (cols.length >= 2) {
            const nom = cols[0]?.replace(/"/g, '').trim() || 'Inconnu';
            const telephone = cols[1]?.replace(/"/g, '').trim();
            const adresse = cols[2]?.replace(/"/g, '').trim() || '';
            const whatsapp = cols[3]?.replace(/"/g, '').trim() || telephone;

            if (telephone) {
                try {
                    await pool.query(
                        'INSERT INTO clients (telephone, nom, adresse, whatsapp) VALUES ($1, $2, $3, $4) ON CONFLICT (telephone) DO UPDATE SET nom = EXCLUDED.nom, adresse = EXCLUDED.adresse, whatsapp = EXCLUDED.whatsapp',
                        [telephone, nom, adresse, whatsapp]
                    );
                    console.log(`✅ Client ajouté : ${nom} (${telephone})`);
                } catch (e) { console.error(`❌ Erreur pour ${nom}:`, e.message); }
            }
        }
    }
}

// Fonction pour parser un fichier VCF (vCard)
async function importVCF(filePath) {
    console.log("Début de l'importation VCF...");
    const content = fs.readFileSync(filePath, 'utf8');
    const contacts = content.split('BEGIN:VCARD');
    
    for (let contact of contacts) {
        if (!contact.trim()) continue;
        let nom = '', telephone = '', adresse = '', whatsapp = '';

        const lines = contact.split('\n');
        for (const line of lines) {
            if (line.startsWith('FN:')) nom = line.replace('FN:', '').trim();
            if (line.startsWith('TEL') && line.includes(':')) {
                const tel = line.split(':')[1].replace(/\D/g, ''); // On ne garde que les chiffres
                if (!telephone) telephone = tel;
                else if (!whatsapp) whatsapp = tel;
            }
            if (line.startsWith('ADR') && line.includes(':')) {
                adresse = line.split(':')[1].replace(/;/g, ' ').trim();
            }
        }

        if (telephone && nom) {
            try {
                await pool.query(
                    'INSERT INTO clients (telephone, nom, adresse, whatsapp) VALUES ($1, $2, $3, $4) ON CONFLICT (telephone) DO UPDATE SET nom = EXCLUDED.nom, adresse = EXCLUDED.adresse, whatsapp = EXCLUDED.whatsapp',
                    [telephone, nom, adresse, whatsapp || telephone]
                );
                console.log(`✅ Client ajouté : ${nom} (${telephone})`);
            } catch (e) { console.error(`❌ Erreur pour ${nom}:`, e.message); }
        }
    }
}

async function run() {
    try {
        const args = process.argv.slice(2);
        if (args.length === 0) {
            console.log("⚠️ Utilisation : node import-clients.js <chemin_du_fichier.csv|vcf>");
            process.exit(1);
        }
        
        const file = args[0];
        if (file.endsWith('.csv')) await importCSV(file);
        else if (file.endsWith('.vcf')) await importVCF(file);
        else console.log("Format non reconnu. Utilisez .csv ou .vcf");

        console.log("🎉 Importation terminée !");
        process.exit(0);
    } catch (e) {
        console.error("Erreur fatale:", e);
        process.exit(1);
    }
}
run();