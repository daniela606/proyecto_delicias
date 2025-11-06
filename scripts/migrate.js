const { pool } = require('../db');
const bcrypt = require('bcryptjs');

async function ensure() {
  try {
    // Crear tabla producto si no existe
    await pool.query(`CREATE TABLE IF NOT EXISTS producto (
      id INT AUTO_INCREMENT PRIMARY KEY,
      nombre VARCHAR(255) NOT NULL,
      precio DECIMAL(10,2) NOT NULL DEFAULT 0,
      imagen VARCHAR(255) DEFAULT '',
      descripcion TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`);

    // Crear tabla usuario si no existe
    await pool.query(`CREATE TABLE IF NOT EXISTS usuario (
      id INT AUTO_INCREMENT PRIMARY KEY,
      nombre VARCHAR(255) NOT NULL,
      usuario VARCHAR(100) NOT NULL UNIQUE,
      password VARCHAR(255) NOT NULL,
      rol VARCHAR(50) DEFAULT 'USER'
    );`);

    // Si no hay usuarios, insertar un usuario por defecto (admin/admin) con contraseña hasheada
    const [users] = await pool.query("SELECT COUNT(*) as cnt FROM usuario");
    if(users && users[0] && users[0].cnt === 0){
      const hash = bcrypt.hashSync('admin', 10);
      await pool.query("INSERT INTO usuario (nombre, usuario, password, rol) VALUES (?,?,?,?)", ['Administrador','admin',hash,'ADMIN']);
      console.log('Usuario por defecto creado: admin / admin (hash aplicado)');
    } else {
      // Si existe el usuario 'admin' con contraseña en texto plano, actualizar al hash
      const [adm] = await pool.query("SELECT id, password FROM usuario WHERE usuario='admin' LIMIT 1");
      if(adm && adm[0]){
        const cur = adm[0].password || '';
        if(!cur.startsWith('$2')){
          const hash = bcrypt.hashSync(cur || 'admin', 10);
          await pool.query("UPDATE usuario SET password=? WHERE id=?", [hash, adm[0].id]);
          console.log('Contraseña del usuario admin actualizada a hash.');
        }
      }
    }

    // Asegurar columnas específicas (por si la tabla ya existía con otra estructura)
    const dbName = process.env.DB_NAME || 'delicias_db';
    const [cols] = await pool.query(
      `SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'producto' AND COLUMN_NAME IN ('imagen','descripcion')`,
      [dbName]
    );
    const present = new Set(cols.map(r => r.COLUMN_NAME));
    if(!present.has('imagen')){
      await pool.query("ALTER TABLE producto ADD COLUMN imagen VARCHAR(255) DEFAULT ''");
      console.log('Columna imagen añadida');
    }
    if(!present.has('descripcion')){
      await pool.query("ALTER TABLE producto ADD COLUMN descripcion TEXT");
      console.log('Columna descripcion añadida');
    }

    console.log('Migración completada');
    return true;
  } catch (err) {
    console.error('Error en migración:', err.message || err);
    throw err;
  }
}

// Si se ejecuta directamente desde la línea de comandos, correr la migración y salir
if (require.main === module) {
  ensure().then(() => process.exit(0)).catch(() => process.exit(1));
}

module.exports = { ensure };
