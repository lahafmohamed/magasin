import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const pool = new pg.Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  user: process.env.DB_USER || 'magasin',
  password: process.env.DB_PASSWORD || 'magasin',
  database: process.env.DB_NAME || 'magasin_dev',
});

async function run() {
  const client = await pool.connect();
  try {
    // Vérifier si la colonne existe déjà
    const { rows } = await client.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name = 'ecritures_comptables' AND column_name = 'compte_numero'`
    );

    if (rows.length === 0) {
      console.log('Ajout de compte_numero...');
      await client.query(`
        ALTER TABLE ecritures_comptables
        ADD COLUMN compte_numero VARCHAR(8) REFERENCES plan_comptable(numero);
      `);

      // Migrer les données existantes depuis compte_id
      await client.query(`
        UPDATE ecritures_comptables e
        SET compte_numero = p.numero
        FROM plan_comptable p
        WHERE e.compte_id = p.id AND e.compte_numero IS NULL;
      `);

      console.log('✅ Colonne compte_numero ajoutée');
    } else {
      console.log('✅ compte_numero existe déjà');
    }

    // Ajouter tiers_id si manquant
    const { rows: t } = await client.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name = 'ecritures_comptables' AND column_name = 'tiers_id'`
    );
    if (t.length === 0) {
      await client.query('ALTER TABLE ecritures_comptables ADD COLUMN tiers_id INTEGER REFERENCES tiers(id);');
      console.log('✅ tiers_id ajouté');
    }

    // Ajouter libelle si manquant (renommer description → libelle)
    const { rows: l } = await client.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name = 'ecritures_comptables' AND column_name = 'libelle'`
    );
    if (l.length === 0) {
      const { rows: desc } = await client.query(
        `SELECT column_name FROM information_schema.columns
         WHERE table_name = 'ecritures_comptables' AND column_name = 'description'`
      );
      if (desc.length > 0) {
        await client.query('ALTER TABLE ecritures_comptables RENAME COLUMN description TO libelle;');
      } else {
        await client.query('ALTER TABLE ecritures_comptables ADD COLUMN libelle TEXT NOT NULL DEFAULT \'\';');
      }
      console.log('✅ libelle ajouté');
    }

    // Ajouter reference_type, reference_id si manquants
    for (const col of ['reference_type', 'reference_id', 'cree_par']) {
      const { rows: r } = await client.query(
        `SELECT column_name FROM information_schema.columns
         WHERE table_name = 'ecritures_comptables' AND column_name = $1`,
        [col]
      );
      if (r.length === 0) {
        const type = col === 'reference_id' ? 'INTEGER' : col === 'cree_par' ? 'INTEGER' : 'VARCHAR(50)';
        await client.query(`ALTER TABLE ecritures_comptables ADD COLUMN ${col} ${type};`);
        console.log(`✅ ${col} ajouté`);
      }
    }

    console.log('\n✅ Migration terminée');
  } catch (err) {
    console.error('❌ Erreur:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
