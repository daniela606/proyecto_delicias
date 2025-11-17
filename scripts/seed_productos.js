const { pool } = require('../db');

async function seedProductos() {
  try {
    // Productos de ejemplo para un restaurante con imágenes locales
    const productos = [
      {
        nombre: 'Arroz con Pollo',
        precio: 18000,
        imagen: '/imagenes/productos/arroz con pollo.jpg',
        descripcion: 'Arroz integral con pollo tierno y verduras'
      },
      {
        nombre: 'Bandeja Paisa',
        precio: 25000,
        imagen: '/imagenes/productos/bandeja paisa.jpg',
        descripcion: 'Plato típico con carne, huevo, chorizo y más'
      },
      {
        nombre: 'Carne Molida y Lentejas',
        precio: 16000,
        imagen: '/imagenes/productos/carne molida y lentejas.jpg',
        descripcion: 'Carne molida sazonada con lentejas cocidas'
      },
      {
        nombre: 'Carne y Frijol',
        precio: 17000,
        imagen: '/imagenes/productos/carne y frijol.jpg',
        descripcion: 'Carne de res con frijoles caseros'
      },
      {
        nombre: 'Carne y Lentejas',
        precio: 17000,
        imagen: '/imagenes/productos/carne y lentejas.jpg',
        descripcion: 'Carne tierna acompañada de lentejas'
      },
      {
        nombre: 'Pollo y Lentejas',
        precio: 15000,
        imagen: '/imagenes/productos/pollo y lentejas.jpg',
        descripcion: 'Pechuga de pollo con lentejas nutritivas'
      },
      {
        nombre: 'Sopa de Pollo',
        precio: 12000,
        imagen: '/imagenes/productos/sopa de pollo.jpg',
        descripcion: 'Sopa caliente de pollo con verduras'
      },
      {
        nombre: 'Sopa de Res',
        precio: 13000,
        imagen: '/imagenes/productos/sopa de res.jpg',
        descripcion: 'Sopa de carne de res con hueso y verduras'
      }
    ];

    // Limpiar productos anteriores
    await pool.query('DELETE FROM producto');

    // Insertar nuevos productos
    for (const prod of productos) {
      await pool.query(
        'INSERT INTO producto (nombre, precio, imagen, descripcion) VALUES (?,?,?,?)',
        [prod.nombre, prod.precio, prod.imagen, prod.descripcion]
      );
    }

    console.log(`✅ ${productos.length} productos insertados exitosamente`);
    process.exit(0);
  } catch (err) {
    console.error('❌ Error al insertar productos:', err.message);
    process.exit(1);
  }
}

seedProductos();
