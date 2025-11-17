-- Esquema mínimo para la aplicación
-- Ejecuta este archivo si quieres crear las tablas manualmente en MySQL

CREATE TABLE IF NOT EXISTS producto (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(255) NOT NULL,
  precio DECIMAL(10,2) NOT NULL DEFAULT 0,
  imagen VARCHAR(255) DEFAULT '',
  descripcion TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS usuario (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(255) NOT NULL,
  cedula VARCHAR(50) NOT NULL UNIQUE,
  usuario VARCHAR(100) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  rol VARCHAR(50) DEFAULT 'MESERO'
);

CREATE TABLE IF NOT EXISTS pedido (
  id INT AUTO_INCREMENT PRIMARY KEY,
  id_usuario INT,
  mesa VARCHAR(50),
  observaciones TEXT,
  estado VARCHAR(50) DEFAULT 'PENDIENTE',
  total DECIMAL(10,2) DEFAULT 0,
  fechaHora TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS detalle_pedido (
  id INT AUTO_INCREMENT PRIMARY KEY,
  id_pedido INT NOT NULL,
  id_producto INT NOT NULL,
  cantidad INT NOT NULL DEFAULT 1,
  observacion TEXT,
  subtotal DECIMAL(10,2) DEFAULT 0,
  estado VARCHAR(50) DEFAULT 'PENDIENTE',
  enviado_a_cocina BOOLEAN DEFAULT 0
);
