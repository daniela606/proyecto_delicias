// Si el proyecto tiene dotenv instalado, cargar .env automáticamente (opcional)
try { require('dotenv').config(); } catch (err) { /* dotenv no está instalado; seguir */ }

const mysql = require('mysql2/promise');

// Configuración desde variables de entorno con valores por defecto seguros
const DB_HOST = process.env.DB_HOST || 'localhost';
const DB_PORT = process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306;
const DB_USER = process.env.DB_USER || 'root';
const DB_PASSWORD = process.env.DB_PASSWORD || '';
const DB_NAME = process.env.DB_NAME || 'delicias_db';

const pool = mysql.createPool({
  host: DB_HOST,
  port: DB_PORT,
  user: DB_USER,
  password: DB_PASSWORD,
  database: DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// Función auxiliar para probar la conexión (dev/test)
async function testConnection() {
  let conn;
  try {
    conn = await pool.getConnection();
    // pequeña comprobación
    const [rows] = await conn.query('SELECT 1 as ok');
    return rows;
  } finally {
    if (conn) conn.release();
  }
}

module.exports = {
  pool,
  testConnection
};
