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
      cedula VARCHAR(50),
      usuario VARCHAR(100) NOT NULL UNIQUE,
      password VARCHAR(255) NOT NULL,
      rol VARCHAR(50) DEFAULT 'MESERO'
    );`);

    // Crear tabla pedido si no existe
    await pool.query(`CREATE TABLE IF NOT EXISTS pedido (
      id INT AUTO_INCREMENT PRIMARY KEY,
      id_usuario INT,
      mesa VARCHAR(50),
      observaciones TEXT,
      estado VARCHAR(50) DEFAULT 'PENDIENTE',
      total DECIMAL(10,2) DEFAULT 0,
      fechaHora TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );`);

    // Crear tabla detalle_pedido si no existe
    await pool.query(`CREATE TABLE IF NOT EXISTS detalle_pedido (
      id INT AUTO_INCREMENT PRIMARY KEY,
      id_pedido INT NOT NULL,
      id_producto INT NOT NULL,
      cantidad INT NOT NULL DEFAULT 1,
      observacion TEXT,
      subtotal DECIMAL(10,2) DEFAULT 0,
      estado VARCHAR(50) DEFAULT 'PENDIENTE'
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

    // Verificar y agregar columna cedula a usuario si no existe
    const [usuarioCols] = await pool.query(
      `SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'usuario' AND COLUMN_NAME = 'cedula'`,
      [dbName]
    );
    if(usuarioCols.length === 0){
      await pool.query("ALTER TABLE usuario ADD COLUMN cedula VARCHAR(50)");
      console.log('Columna cedula añadida a usuario');
    }

    // Verificar y agregar columna estado a detalle_pedido si no existe
    const [detalleCols] = await pool.query(
      `SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'detalle_pedido' AND COLUMN_NAME = 'estado'`,
      [dbName]
    );
    if(detalleCols.length === 0){
      await pool.query("ALTER TABLE detalle_pedido ADD COLUMN estado VARCHAR(50) DEFAULT 'PENDIENTE'");
      console.log('Columna estado añadida a detalle_pedido');
    }

    // Verificar y agregar columna enviado_a_cocina a detalle_pedido si no existe
    const [enviadoCols] = await pool.query(
      `SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'detalle_pedido' AND COLUMN_NAME = 'enviado_a_cocina'`,
      [dbName]
    );
    if(enviadoCols.length === 0){
      await pool.query("ALTER TABLE detalle_pedido ADD COLUMN enviado_a_cocina BOOLEAN DEFAULT 0");
      console.log('Columna enviado_a_cocina añadida a detalle_pedido');
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
