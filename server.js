
const express = require('express');
const { pool } = require('./db');
const bcrypt = require('bcryptjs');
const bodyParser = require('body-parser');
const path = require('path');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));


app.post('/api/login', async (req, res) => {
  const { usuario, password } = req.body;
  try {
    const [rows] = await pool.query('SELECT id, nombre, rol, password FROM usuario WHERE usuario=? LIMIT 1', [usuario]);
    if (rows.length === 0) return res.status(401).json({ error: 'Credenciales inválidas' });
    const user = rows[0];
    const match = await bcrypt.compare(password || '', user.password || '');
    if (!match) return res.status(401).json({ error: 'Credenciales inválidas' });
    // no devolver el hash al cliente
    res.json({ id: user.id, nombre: user.nombre, rol: user.rol });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Registrar nuevo usuario
app.post('/api/register', async (req, res) => {
  const { nombre, usuario, password } = req.body;
  if (!nombre || !usuario || !password) return res.status(400).json({ error: 'nombre, usuario y password son requeridos' });
  try {
    const [exists] = await pool.query('SELECT id FROM usuario WHERE usuario=? LIMIT 1', [usuario]);
    if (exists.length > 0) return res.status(409).json({ error: 'El usuario ya existe' });
    const hash = await bcrypt.hash(password, 10);
  // rol debe coincidir con los valores permitidos en la base (ADMIN, MESERO, COCINA)
  const defaultRole = 'MESERO';
  const [r] = await pool.query('INSERT INTO usuario (nombre, usuario, password, rol) VALUES (?,?,?,?)', [nombre, usuario, hash, defaultRole]);
    res.json({ id: r.insertId, nombre, usuario });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


app.get('/api/products', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM producto ORDER BY id');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// Crear un nuevo producto (admin)
app.post('/api/products', async (req, res) => {
  const { nombre, precio, imagen, descripcion } = req.body;
  if (!nombre || precio == null) return res.status(400).json({ error: 'nombre y precio son requeridos' });
  try {
    const [r] = await pool.query('INSERT INTO producto (nombre, precio, imagen, descripcion) VALUES (?,?,?,?)', [nombre, precio, imagen || '', descripcion || '']);
    res.json({ id: r.insertId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// Añadir un item a la mesa: crea/usa pedido PENDIENTE y añade detalle_pedido
app.post('/api/mesa/:mesa/items', async (req, res) => {
  const mesa = req.params.mesa;
  const { id_producto, cantidad, observacion, id_usuario } = req.body;
  if (!id_producto || !cantidad) return res.status(400).json({ error: 'id_producto y cantidad son requeridos' });
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    // buscar pedido pendiente para la mesa
    const [ped] = await conn.query('SELECT * FROM pedido WHERE mesa=? AND estado="PENDIENTE" LIMIT 1', [mesa]);
    let idPedido;
    if (ped.length === 0) {
      // crear pedido
      const [r] = await conn.query('INSERT INTO pedido (id_usuario, mesa, observaciones, estado, total) VALUES (?,?,?,?,?)',
        [id_usuario || 1, mesa, '', 'PENDIENTE', 0]);
      idPedido = r.insertId;
    } else {
      idPedido = ped[0].id;
    }
    // obtener precio
    const [p] = await conn.query('SELECT precio FROM producto WHERE id=?', [id_producto]);
    if (p.length === 0) throw new Error('Producto no encontrado');
    const precio = p[0].precio;
    const subtotal = Number(precio) * Number(cantidad);
    const [ins] = await conn.query('INSERT INTO detalle_pedido (id_pedido,id_producto,cantidad,observacion,subtotal) VALUES (?,?,?,?,?)',
      [idPedido, id_producto, cantidad, observacion || '', subtotal]);
    // recalcular total
    const [sumR] = await conn.query('SELECT SUM(subtotal) as total FROM detalle_pedido WHERE id_pedido=?', [idPedido]);
    const total = sumR[0].total || 0;
    await conn.query('UPDATE pedido SET total=? WHERE id=?', [total, idPedido]);
    await conn.commit();
    res.json({ idPedido, total, detalleId: ins.insertId });
  } catch (err) {
    await conn.rollback();
    res.status(500).json({ error: err.message });
  } finally {
    conn.release();
  }
});


// Actualizar cantidad/observacion de un detalle de pedido
app.patch('/api/mesa/:mesa/items/:detalleId', async (req, res) => {
  const { detalleId } = req.params;
  const { cantidad, observacion } = req.body;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    // actualizar detalle
    await conn.query('UPDATE detalle_pedido SET cantidad=?, observacion=? WHERE id=?', [cantidad, observacion || '', detalleId]);
    // recalcular subtotal y total
    const [p] = await conn.query('SELECT dp.id_pedido, p.precio FROM detalle_pedido dp JOIN producto p ON dp.id_producto = p.id WHERE dp.id=?', [detalleId]);
    if (p.length === 0) throw new Error('Detalle no encontrado');
    const idPedido = p[0].id_pedido;
    const precio = p[0].precio;
    const subtotal = Number(precio) * Number(cantidad);
    await conn.query('UPDATE detalle_pedido SET subtotal=? WHERE id=?', [subtotal, detalleId]);
    const [sumR] = await conn.query('SELECT SUM(subtotal) as total FROM detalle_pedido WHERE id_pedido=?', [idPedido]);
    const total = sumR[0].total || 0;
    await conn.query('UPDATE pedido SET total=? WHERE id=?', [total, idPedido]);
    await conn.commit();
    res.json({ idPedido, total });
  } catch (err) {
    await conn.rollback();
    res.status(500).json({ error: err.message });
  } finally {
    conn.release();
  }
});


// Eliminar un detalle de pedido
app.delete('/api/mesa/:mesa/items/:detalleId', async (req, res) => {
  const { detalleId } = req.params;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [p] = await conn.query('SELECT id_pedido FROM detalle_pedido WHERE id=?', [detalleId]);
    if (p.length === 0) return res.status(404).json({ error: 'Detalle no encontrado' });
    const idPedido = p[0].id_pedido;
    await conn.query('DELETE FROM detalle_pedido WHERE id=?', [detalleId]);
    const [sumR] = await conn.query('SELECT SUM(subtotal) as total FROM detalle_pedido WHERE id_pedido=?', [idPedido]);
    const total = sumR[0].total || 0;
    await conn.query('UPDATE pedido SET total=? WHERE id=?', [total, idPedido]);
    await conn.commit();
    res.json({ idPedido, total });
  } catch (err) {
    await conn.rollback();
    res.status(500).json({ error: err.message });
  } finally {
    conn.release();
  }
});


// Obtener pedido pendiente y detalles para una mesa
app.get('/api/mesa/:mesa', async (req, res) => {
  const mesa = req.params.mesa;
  try {
    const [ped] = await pool.query('SELECT * FROM pedido WHERE mesa=? AND estado="PENDIENTE" LIMIT 1', [mesa]);
    if (ped.length === 0) return res.json({ pedido: null, items: [] });
    const pedido = ped[0];
    const [items] = await pool.query('SELECT dp.id, dp.id_producto, dp.cantidad, dp.observacion, dp.subtotal, p.nombre, p.precio FROM detalle_pedido dp JOIN producto p ON dp.id_producto = p.id WHERE dp.id_pedido=?', [pedido.id]);
    res.json({ pedido, items });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// Obtener resumen de mesas (1..16) con estado pendiente y total
app.get('/api/mesas', async (req, res) => {
  try {
    // obtener sums por mesa de pedidos pendientes
    const [rows] = await pool.query("SELECT mesa, SUM(total) as total, COUNT(*) as pedidos FROM pedido WHERE estado='PENDIENTE' GROUP BY mesa");
    // construir mapa
    const map = {};
    rows.forEach(r => { map[String(r.mesa)] = { total: Number(r.total||0), pedidos: r.pedidos }; });
    const mesas = [];
    for(let i=1;i<=16;i++){
      const key = String(i);
      mesas.push({
        id: i,
        tienePendiente: !!map[key],
        total: map[key] ? map[key].total : 0
      });
    }
    res.json(mesas);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


app.post('/api/orders', async (req, res) => {
  const { id_usuario, mesa, observaciones, items } = req.body; // items = [{id_producto, cantidad, observacion}]
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [r] = await conn.query('INSERT INTO pedido (id_usuario, mesa, observaciones, estado, total) VALUES (?,?,?,?,?)',
      [id_usuario, mesa, observaciones, 'PENDIENTE', 0]);
    const idPedido = r.insertId;
    let total = 0;
    for (const it of items) {
      const [p] = await conn.query('SELECT precio FROM producto WHERE id=?', [it.id_producto]);
      const precio = p[0].precio;
      const subtotal = (precio * it.cantidad);
      total += subtotal;
      await conn.query('INSERT INTO detalle_pedido (id_pedido,id_producto,cantidad,observacion,subtotal) VALUES (?,?,?,?,?)',
        [idPedido, it.id_producto, it.cantidad, it.observacion || '', subtotal]);
    }
    await conn.query('UPDATE pedido SET total=? WHERE id=?', [total, idPedido]);
    await conn.commit();
    res.json({ idPedido, total });
  } catch (err) {
    await conn.rollback();
    res.status(500).json({ error: err.message });
  } finally {
    conn.release();
  }
});


// Añadir un item a la mesa: crea o usa pedido PENDIENTE para la mesa y añade detalle_pedido
app.post('/api/mesa/:mesa/items', async (req, res) => {
  const mesa = req.params.mesa;
  const { id_producto, cantidad = 1, observacion = '', id_usuario } = req.body;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    // Buscar pedido pendiente para la mesa
    const [pedidos] = await conn.query('SELECT * FROM pedido WHERE mesa=? AND estado=? ORDER BY fechaHora DESC LIMIT 1', [mesa, 'PENDIENTE']);
    let idPedido;
    if (pedidos.length === 0) {
      // crear pedido nuevo
      const [r] = await conn.query('INSERT INTO pedido (id_usuario, mesa, observaciones, estado, total) VALUES (?,?,?,?,?)', [id_usuario || null, mesa, '', 'PENDIENTE', 0]);
      idPedido = r.insertId;
    } else {
      idPedido = pedidos[0].id;
    }

    // Obtener precio del producto
    const [p] = await conn.query('SELECT precio FROM producto WHERE id=?', [id_producto]);
    if (p.length === 0) throw new Error('Producto no encontrado');
    const precio = Number(p[0].precio) || 0;
    const subtotal = precio * Number(cantidad);

    await conn.query('INSERT INTO detalle_pedido (id_pedido,id_producto,cantidad,observacion,subtotal) VALUES (?,?,?,?,?)', [idPedido, id_producto, cantidad, observacion || '', subtotal]);

    // Recalcular total
    const [sum] = await conn.query('SELECT SUM(subtotal) as total FROM detalle_pedido WHERE id_pedido=?', [idPedido]);
    const total = Number(sum[0].total) || 0;
    await conn.query('UPDATE pedido SET total=? WHERE id=?', [total, idPedido]);

    await conn.commit();
    res.json({ idPedido, total });
  } catch (err) {
    await conn.rollback();
    res.status(500).json({ error: err.message });
  } finally {
    conn.release();
  }
});


app.get('/api/orders/pending', async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT * FROM pedido WHERE estado='PENDIENTE' ORDER BY fechaHora DESC");
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


app.patch('/api/orders/:id/status', async (req, res) => {
  const id = req.params.id;
  const { estado } = req.body;
  try {
    await pool.query('UPDATE pedido SET estado=? WHERE id=?', [estado, id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


app.get('/api/orders/:id/details', async (req, res) => {
  const id = req.params.id;
  try {
    const [rows] = await pool.query('SELECT dp.*, p.nombre, p.precio FROM detalle_pedido dp JOIN producto p ON dp.id_producto = p.id WHERE dp.id_pedido=?', [id]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


app.get('*', (req,res) => {
  res.sendFile(path.join(__dirname,'public','index.html'));
});

const PORT = process.env.PORT || 3000;

// Ejecutar migraciones al inicio y luego arrancar el servidor
(async function start(){
  try{
    const migrator = require('./scripts/migrate');
    if(migrator && typeof migrator.ensure === 'function'){
      console.log('Ejecutando migraciones...');
      await migrator.ensure();
    }
  }catch(e){
    console.warn('Error ejecutando migraciones (continuando):', e.message || e);
  }

  app.listen(PORT, ()=> console.log(`Server en http://localhost:${PORT}`));
})();
