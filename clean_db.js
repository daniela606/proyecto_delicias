const { pool } = require('./db.js');

async function cleanDuplicates() {
  const conn = await pool.getConnection();
  try {
    console.log('Limpiando datos duplicados...');
    
    // Eliminar todos los detalles de pedidos
    const [result1] = await conn.query('DELETE FROM detalle_pedido');
    console.log(`Eliminados ${result1.affectedRows} detalles`);
    
    // Eliminar todos los pedidos excepto los que están COBRADO o CANCELADO (para mantener historial)
    const [result2] = await conn.query("DELETE FROM pedido WHERE estado NOT IN ('COBRADO', 'CANCELADO')");
    console.log(`Eliminados ${result2.affectedRows} pedidos`);
    
    console.log('Limpieza completada!');
    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

cleanDuplicates();
