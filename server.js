
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
  const { usuario, password, rol } = req.body;
  try {
    if (!usuario || !password || !rol) {
      return res.status(400).json({ error: 'usuario, password y rol son requeridos' });
    }
    const [rows] = await pool.query('SELECT id, nombre, rol, password FROM usuario WHERE usuario=? AND rol=? LIMIT 1', [usuario, rol]);
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
  const { nombre, cedula, usuario, password, rol } = req.body;
  if (!nombre || !cedula || !usuario || !password || !rol) return res.status(400).json({ error: 'nombre, cedula, usuario, password y rol son requeridos' });
  
  // Validar que el rol sea uno de los permitidos
  if (rol !== 'MESERO' && rol !== 'COCINA') {
    return res.status(400).json({ error: 'Rol inválido. Debe ser MESERO o COCINA' });
  }
  
  try {
    const [exists] = await pool.query('SELECT id FROM usuario WHERE usuario=? OR cedula=? LIMIT 1', [usuario, cedula]);
    if (exists.length > 0) return res.status(409).json({ error: 'El usuario o cédula ya existe' });
    const hash = await bcrypt.hash(password, 10);
    const [r] = await pool.query('INSERT INTO usuario (nombre, cedula, usuario, password, rol) VALUES (?,?,?,?,?)', [nombre, cedula, usuario, hash, rol]);
    res.json({ id: r.insertId, nombre, cedula, usuario, rol });
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

// Eliminar un producto (admin)
app.delete('/api/products/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM producto WHERE id=?', [id]);
    res.json({ ok: true });
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
    // buscar pedido ACTIVO (no finalizado): PENDIENTE, PREPARANDO, LISTO, o CAJA
    const [ped] = await conn.query('SELECT * FROM pedido WHERE mesa=? AND estado IN ("PENDIENTE", "PREPARANDO", "LISTO", "CAJA") LIMIT 1', [mesa]);
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
    const [ins] = await conn.query('INSERT INTO detalle_pedido (id_pedido,id_producto,cantidad,observacion,subtotal,estado,enviado_a_cocina) VALUES (?,?,?,?,?,?,?)',
      [idPedido, id_producto, cantidad, observacion || '', subtotal, 'PENDIENTE', 0]);
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
    const [ped] = await pool.query('SELECT * FROM pedido WHERE mesa=? AND estado IN ("PENDIENTE", "PREPARANDO", "LISTO") LIMIT 1', [mesa]);
    if (ped.length === 0) return res.json({ id_pedido: null, pedido: null, items: [], estado: null });
    const pedido = ped[0];
    const [items] = await pool.query('SELECT dp.id, dp.id_producto, dp.cantidad, dp.observacion, dp.subtotal, p.nombre, p.precio FROM detalle_pedido dp JOIN producto p ON dp.id_producto = p.id WHERE dp.id_pedido=?', [pedido.id]);
    res.json({ id_pedido: pedido.id, pedido, items, estado: pedido.estado });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// Obtener resumen de mesas (1..16) con estado pendiente y total
app.get('/api/mesas', async (req, res) => {
  try {
    // obtener sums por mesa de pedidos activos (no cobrados ni cancelados)
    const [rows] = await pool.query("SELECT mesa, SUM(total) as total, COUNT(*) as pedidos FROM pedido WHERE estado IN ('PENDIENTE', 'PREPARANDO', 'LISTO', 'CAJA') GROUP BY mesa");
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
    
    // Buscar si ya existe un pedido activo (no finalizado) para esta mesa
    const [existingPedidos] = await conn.query(
      'SELECT * FROM pedido WHERE mesa=? AND estado NOT IN ("LISTO", "CAJA", "COBRADO", "CANCELADO") LIMIT 1',
      [mesa]
    );
    
    let idPedido;
    if (existingPedidos.length > 0) {
      // Reutilizar el pedido existente - SOLO cambiar estado si es PENDIENTE
      idPedido = existingPedidos[0].id;
      if (existingPedidos[0].estado === 'PENDIENTE') {
        await conn.query('UPDATE pedido SET estado=? WHERE id=?', ['PREPARANDO', idPedido]);
      }
    } else {
      // Crear nuevo pedido
      const [r] = await conn.query('INSERT INTO pedido (id_usuario, mesa, observaciones, estado, total) VALUES (?,?,?,?,?)',
        [id_usuario, mesa, observaciones, 'PREPARANDO', 0]);
      idPedido = r.insertId;
    }
    
    // Calcular el total actual del pedido
    const [detallesActuales] = await conn.query(
      'SELECT COALESCE(SUM(subtotal), 0) as total FROM detalle_pedido WHERE id_pedido=?',
      [idPedido]
    );
    let total = detallesActuales[0].total || 0;
    
    // Agregar solo los nuevos detalles (sin borrar los anteriores)
    for (const it of items) {
      const [p] = await conn.query('SELECT precio FROM producto WHERE id=?', [it.id_producto]);
      const precio = p[0].precio;
      const subtotal = (precio * it.cantidad);
      total += subtotal;
      await conn.query('INSERT INTO detalle_pedido (id_pedido,id_producto,cantidad,observacion,subtotal,estado) VALUES (?,?,?,?,?,?)',
        [idPedido, it.id_producto, it.cantidad, it.observacion || '', subtotal, 'PENDIENTE']);
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
// Endpoint para solo cambiar el estado del pedido a PREPARANDO (sin agregar items duplicados)
app.post('/api/mesa/:mesa/enviar-cocina', async (req, res) => {
  const mesa = req.params.mesa;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    
    // Buscar el pedido activo (PENDIENTE o PREPARANDO) de esta mesa
    const [pedidos] = await conn.query(
      'SELECT id FROM pedido WHERE mesa=? AND estado IN ("PENDIENTE", "PREPARANDO") LIMIT 1',
      [mesa]
    );
    
    if (pedidos.length === 0) {
      console.log(`No hay pedido activo para mesa ${mesa}`);
      await conn.commit();
      return res.json({ ok: true, msg: 'No hay pedido activo' });
    }
    
    const idPedido = pedidos[0].id;
    console.log(`Cambiando estado del pedido ${idPedido} de mesa ${mesa} a PREPARANDO`);
    
    // Marcar TODOS los detalles no enviados a cocina con el flag enviado_a_cocina = TRUE
    // SIN cambiar su estado (mantienen PENDIENTE o PREPARANDO)
    const [updateResult] = await conn.query(
      'UPDATE detalle_pedido SET enviado_a_cocina=? WHERE id_pedido=? AND enviado_a_cocina=?',
      [1, idPedido, 0]
    );
    console.log(`Marcados ${updateResult.affectedRows} detalles como enviados a cocina`);
    
    // Cambiar el estado del pedido a PREPARANDO
    await conn.query('UPDATE pedido SET estado=? WHERE id=?', ['PREPARANDO', idPedido]);
    
    await conn.commit();
    res.json({ ok: true, msg: 'Pedido enviado a cocina' });
  } catch (err) {
    await conn.rollback();
    console.error('Error en enviar-cocina:', err);
    res.status(500).json({ error: err.message });
  } finally {
    conn.release();
  }
});




app.delete('/api/mesa/:mesa/pedido', async (req, res) => {
  const mesa = req.params.mesa;
  try {
    // Eliminar TODOS los pedidos de esta mesa (sin importar estado)
    const [allPedidos] = await pool.query('SELECT id FROM pedido WHERE mesa=?', [mesa]);
    for (const ped of allPedidos) {
      await pool.query('DELETE FROM detalle_pedido WHERE id_pedido=?', [ped.id]);
      await pool.query('DELETE FROM pedido WHERE id=?', [ped.id]);
    }
    
    res.json({ ok: true, mensaje: 'Mesa limpiada completamente', pedidosEliminados: allPedidos.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
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

// Enviar pedido a Caja (equivalente a enviar a cocina pero con intención de ir a caja)
app.post('/api/pedido/caja', async (req, res) => {
  const { id_usuario, mesa, observaciones, items } = req.body;
  const conn = await pool.getConnection();
  try {
    if (!id_usuario || !mesa || !items || items.length === 0) {
      return res.status(400).json({ error: 'Datos incompletos' });
    }
    
    await conn.beginTransaction();
    
    // Primero, eliminar todos los detalles LISTO del pedido anterior
    const [mesaActual] = await conn.query(
      `SELECT p.id FROM pedido p 
       WHERE p.mesa = ? AND p.estado IN ('PENDIENTE', 'PREPARANDO', 'LISTO')
       LIMIT 1`,
      [mesa]
    );
    
    if (mesaActual.length > 0) {
      console.log(`Eliminando detalles LISTO del pedido ${mesaActual[0].id}`);
      // Eliminar detalles LISTO para que desaparezca la campanita
      await conn.query(
        'DELETE FROM detalle_pedido WHERE id_pedido=? AND estado=?',
        [mesaActual[0].id, 'LISTO']
      );
      
      // Si todos los detalles fueron eliminados, eliminar también el pedido
      const [remaining] = await conn.query(
        'SELECT COUNT(*) as cnt FROM detalle_pedido WHERE id_pedido=?',
        [mesaActual[0].id]
      );
      if (remaining[0].cnt === 0) {
        console.log(`Eliminando pedido vacío ${mesaActual[0].id}`);
        await conn.query('DELETE FROM pedido WHERE id=?', [mesaActual[0].id]);
      }
    }
    
    // Calcular total de items
    let total = 0;
    const [productos] = await conn.query('SELECT id, precio FROM producto WHERE id IN (' + items.map(()=>'?').join(',') + ')', items.map(i=>i.id_producto));
    const prodMap = {};
    productos.forEach(p => prodMap[p.id] = p.precio);
    items.forEach(i => total += (prodMap[i.id_producto] || 0) * i.cantidad);

    // Crear pedido con estado CAJA
    const [result] = await conn.query(
      'INSERT INTO pedido (id_usuario, mesa, observaciones, estado, total, fechaHora) VALUES (?,?,?,?,?,NOW())',
      [id_usuario, mesa, observaciones || '', 'CAJA', total]
    );
    const id_pedido = result.insertId;

    // Guardar detalles del pedido
    for (const item of items) {
      const [prod] = await conn.query('SELECT precio FROM producto WHERE id=?', [item.id_producto]);
      const precio = prod[0]?.precio || 0;
      const subtotal = precio * item.cantidad;
      await conn.query(
        'INSERT INTO detalle_pedido (id_pedido, id_producto, cantidad, observacion, subtotal, estado) VALUES (?,?,?,?,?,?)',
        [id_pedido, item.id_producto, item.cantidad, item.observacion || '', subtotal, 'CAJA']
      );
    }

    await conn.commit();
    res.json({ ok: true, id: id_pedido });
  } catch (err) {
    await conn.rollback();
    res.status(500).json({ error: err.message });
  } finally {
    conn.release();
  }
});

// Obtener todos los pedidos en CAJA (listos para cobrar)
app.get('/api/caja', async (req, res) => {
  try {
    const [pedidos] = await pool.query(`
      SELECT p.id, p.mesa, p.total, p.fechaHora, u.nombre as nombreMesero, p.estado
      FROM pedido p
      JOIN usuario u ON p.id_usuario = u.id
      WHERE p.estado = 'CAJA'
      ORDER BY p.fechaHora DESC
    `);

    // Para cada pedido, obtener sus detalles
    const resultado = [];
    for (const pedido of pedidos) {
      const [detalles] = await pool.query(`
        SELECT dp.id, dp.cantidad, dp.observacion, dp.subtotal, p.nombre
        FROM detalle_pedido dp
        JOIN producto p ON dp.id_producto = p.id
        WHERE dp.id_pedido = ?
      `, [pedido.id]);
      resultado.push({
        ...pedido,
        items: detalles
      });
    }

    res.json(resultado);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Marcar pedido como cobrado
app.post('/api/pedido/:id/cobrar', async (req, res) => {
  const id = req.params.id;
  try {
    await pool.query('UPDATE pedido SET estado=? WHERE id=?', ['COBRADO', id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Cancelar pedido (cambiar estado a CANCELADO)
app.post('/api/pedido/:id/cancelar', async (req, res) => {
  const id = req.params.id;
  try {
    await pool.query('UPDATE pedido SET estado=? WHERE id=?', ['CANCELADO', id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Obtener detalles de un pedido específico
app.get('/api/pedido/:id', async (req, res) => {
  const idPedido = req.params.id;
  try {
    const [pedido] = await pool.query('SELECT * FROM pedido WHERE id=?', [idPedido]);
    if(pedido.length === 0) return res.status(404).json({ error: 'Pedido no encontrado' });
    
    const [items] = await pool.query(`
      SELECT dp.id, dp.cantidad, dp.observacion, dp.subtotal, dp.estado, p.nombre, p.imagen, p.precio
      FROM detalle_pedido dp
      JOIN producto p ON dp.id_producto = p.id
      WHERE dp.id_pedido = ?
    `, [idPedido]);
    
    res.json({
      ...pedido[0],
      items: items
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Marcar un detalle como LISTO
app.post('/api/detalle/:detalleId/listo', async (req, res) => {
  const detalleId = req.params.detalleId;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    
    // Actualizar estado del detalle a LISTO
    await conn.query('UPDATE detalle_pedido SET estado=? WHERE id=?', ['LISTO', detalleId]);
    
    // Obtener el id_pedido del detalle
    const [detail] = await conn.query('SELECT id_pedido FROM detalle_pedido WHERE id=?', [detalleId]);
    if(detail.length === 0) throw new Error('Detalle no encontrado');
    
    const idPedido = detail[0].id_pedido;
    
    // Verificar si todos los detalles del pedido están LISTO
    const [pendientes] = await conn.query(
      'SELECT COUNT(*) as cnt FROM detalle_pedido WHERE id_pedido=? AND estado != "LISTO"',
      [idPedido]
    );
    
    // Si no hay pendientes, marcar el pedido como LISTO
    if(pendientes[0].cnt === 0) {
      await conn.query('UPDATE pedido SET estado=? WHERE id=?', ['LISTO', idPedido]);
    }
    
    await conn.commit();
    res.json({ ok: true });
  } catch (err) {
    await conn.rollback();
    res.status(500).json({ error: err.message });
  } finally {
    conn.release();
  }
});

// Obtener todos los pedidos para COCINA (PENDIENTE y PREPARANDO)
app.get('/api/cocina', async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const [pedidos] = await conn.query(`
      SELECT DISTINCT p.id, p.mesa, p.total, p.fechaHora, u.nombre as nombreMesero, p.estado
      FROM pedido p
      JOIN usuario u ON p.id_usuario = u.id
      WHERE p.estado IN ('PENDIENTE', 'PREPARANDO')
      ORDER BY p.fechaHora ASC
    `);

    // Para cada pedido, obtener solo detalles que NO están LISTO
    const resultado = [];
    const procesados = new Set(); // Para evitar duplicados
    
    for (const pedido of pedidos) {
      // Evitar procesar el mismo pedido 2 veces
      if (procesados.has(pedido.id)) continue;
      procesados.add(pedido.id);
      
      const [detalles] = await conn.query(`
        SELECT dp.id, dp.cantidad, dp.observacion, dp.subtotal, dp.estado, p.nombre, p.imagen, p.precio
        FROM detalle_pedido dp
        JOIN producto p ON dp.id_producto = p.id
        WHERE dp.id_pedido = ? AND dp.estado IN ('PENDIENTE', 'PREPARANDO') AND dp.enviado_a_cocina = 1
      `, [pedido.id]);
      
      // Solo agregar el pedido si tiene detalles pendientes
      if (detalles.length > 0) {
        resultado.push({
          ...pedido,
          items: detalles
        });
      }
    }

    res.json(resultado);
    conn.release();
  } catch (err) {
    conn.release();
    res.status(500).json({ error: err.message });
  }
});

// Marcar pedido como PREPARANDO
app.post('/api/pedido/:id/preparando', async (req, res) => {
  const id = req.params.id;
  try {
    await pool.query('UPDATE pedido SET estado=? WHERE id=?', ['PREPARANDO', id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Marcar pedido como LISTO (preparación completada, listo para entregar)
app.post('/api/pedido/:id/listo', async (req, res) => {
  const id = req.params.id;
  try {
    await pool.query('UPDATE pedido SET estado=? WHERE id=?', ['LISTO', id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Obtener productos listos por mesa (para notificar al mesero)
app.get('/api/mesa/:mesa/listos', async (req, res) => {
  const mesa = req.params.mesa;
  try {
    const [detalles] = await pool.query(`
      SELECT dp.id, dp.id_producto, p.nombre, dp.cantidad, p.imagen
      FROM detalle_pedido dp
      JOIN producto p ON dp.id_producto = p.id
      JOIN pedido ped ON dp.id_pedido = ped.id
      WHERE ped.mesa = ? AND dp.estado = 'LISTO'
    `, [mesa]);
    
    res.json({ mesa, listos: detalles });
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
