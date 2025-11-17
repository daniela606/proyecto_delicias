const fs = require('fs');
const https = require('https');
const path = require('path');

const imageDir = path.join(__dirname, '..', 'public', 'imagenes', 'productos');

// Crear directorio si no existe
if (!fs.existsSync(imageDir)) {
  fs.mkdirSync(imageDir, { recursive: true });
  console.log(`📁 Directorio creado: ${imageDir}`);
}

// URLs de imágenes de comida real desde una fuente confiable
const images = [
  {
    name: 'hamburguesa-clasica.jpg',
    url: 'https://images.pexels.com/photos/5632283/pexels-photo-5632283.jpeg?w=300&h=200&fit=crop'
  },
  {
    name: 'hamburguesa-doble.jpg',
    url: 'https://images.pexels.com/photos/4551832/pexels-photo-4551832.jpeg?w=300&h=200&fit=crop'
  },
  {
    name: 'hot-dog.jpg',
    url: 'https://images.pexels.com/photos/3407881/pexels-photo-3407881.jpeg?w=300&h=200&fit=crop'
  },
  {
    name: 'pizza-margarita.jpg',
    url: 'https://images.pexels.com/photos/3619936/pexels-photo-3619936.jpeg?w=300&h=200&fit=crop'
  },
  {
    name: 'pizza-pepperoni.jpg',
    url: 'https://images.pexels.com/photos/3535185/pexels-photo-3535185.jpeg?w=300&h=200&fit=crop'
  },
  {
    name: 'pollo-frito.jpg',
    url: 'https://images.pexels.com/photos/5490228/pexels-photo-5490228.jpeg?w=300&h=200&fit=crop'
  },
  {
    name: 'ensalada-cesar.jpg',
    url: 'https://images.pexels.com/photos/4551793/pexels-photo-4551793.jpeg?w=300&h=200&fit=crop'
  },
  {
    name: 'pasta-carbonara.jpg',
    url: 'https://images.pexels.com/photos/4349410/pexels-photo-4349410.jpeg?w=300&h=200&fit=crop'
  },
  {
    name: 'tacos-carne.jpg',
    url: 'https://images.pexels.com/photos/5737391/pexels-photo-5737391.jpeg?w=300&h=200&fit=crop'
  },
  {
    name: 'alitas-bbq.jpg',
    url: 'https://images.pexels.com/photos/6551627/pexels-photo-6551627.jpeg?w=300&h=200&fit=crop'
  },
  {
    name: 'ceviche.jpg',
    url: 'https://images.pexels.com/photos/3915857/pexels-photo-3915857.jpeg?w=300&h=200&fit=crop'
  },
  {
    name: 'sandwich.jpg',
    url: 'https://images.pexels.com/photos/5591633/pexels-photo-5591633.jpeg?w=300&h=200&fit=crop'
  },
  {
    name: 'quesadilla.jpg',
    url: 'https://images.pexels.com/photos/5640109/pexels-photo-5640109.jpeg?w=300&h=200&fit=crop'
  },
  {
    name: 'costillas-bbq.jpg',
    url: 'https://images.pexels.com/photos/1092730/pexels-photo-1092730.jpeg?w=300&h=200&fit=crop'
  },
  {
    name: 'milanga-pollo.jpg',
    url: 'https://images.pexels.com/photos/5938279/pexels-photo-5938279.jpeg?w=300&h=200&fit=crop'
  }
];

async function downloadImage(url, filepath) {
  return new Promise((resolve, reject) => {
    https.get(url, (response) => {
      if (response.statusCode === 200) {
        response.pipe(fs.createWriteStream(filepath))
          .on('finish', () => resolve())
          .on('error', reject);
      } else {
        reject(new Error(`Status ${response.statusCode}`));
      }
    }).on('error', reject);
  });
}

async function downloadAllImages() {
  console.log('🖼️  Descargando imágenes de comida...\n');
  
  for (const img of images) {
    const filepath = path.join(imageDir, img.name);
    try {
      await downloadImage(img.url, filepath);
      console.log(`✅ Descargada: ${img.name}`);
    } catch (err) {
      console.error(`❌ Error descargando ${img.name}:`, err.message);
    }
  }
  
  console.log('\n✅ Descarga completada');
  process.exit(0);
}

downloadAllImages().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
