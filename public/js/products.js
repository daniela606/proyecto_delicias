// Usa la función api() definida en app.js

async function loadAdminProducts(){
  const container = document.getElementById('listado');
  if(!container) return;
  try{
    const prods = await api('/products');
    container.innerHTML = '';
    if(prods.length === 0){
      container.innerHTML = '<p style="grid-column: 1 / -1; text-align: center; color: #999;">No hay productos registrados aún</p>';
      return;
    }
    prods.forEach(p=>{
      const div = document.createElement('div');
      div.className = 'producto-card';
      div.innerHTML = `
        <img src="${p.imagen || 'https://via.placeholder.com/200x100'}" alt="${p.nombre}" class="producto-img">
        <div class="producto-info">
          <div class="producto-nombre">${p.nombre}</div>
          <div class="producto-precio">$${Number(p.precio).toFixed(2)}</div>
          <div class="producto-desc">${p.descripcion || 'Sin descripción'}</div>
          <div class="producto-actions">
            <button class="btn-delete" onclick="deleteProduct(${p.id})">🗑️ Eliminar</button>
          </div>
        </div>
      `;
      container.appendChild(div);
    });
  }catch(e){
    container.innerText = 'Error cargando productos: ' + e.message;
  }
}

async function deleteProduct(id){
  if(!confirm('¿Eliminar este producto?')) return;
  try{
    await api(`/products/${id}`, {method: 'DELETE'});
    await loadAdminProducts();
    alert('Producto eliminado');
  }catch(e){
    alert('Error: ' + e.message);
  }
}

if(document.getElementById('listado')) loadAdminProducts();

if(document.getElementById('formAdd')){
  document.getElementById('formAdd').onsubmit = async (ev)=>{
    ev.preventDefault();
    const nombre = document.getElementById('nombre').value.trim();
    const precio = Number(document.getElementById('precio').value);
    const imagen = document.getElementById('imagen').value.trim();
    const descripcion = document.getElementById('descripcion').value.trim();
    if(!nombre || isNaN(precio)) { alert('Nombre y precio son requeridos'); return; }
    try{
      await api('/products',{method:'POST', body: JSON.stringify({nombre,precio,imagen,descripcion})});
      document.getElementById('formAdd').reset();
      await loadAdminProducts();
      alert('Producto agregado correctamente');
    }catch(e){
      alert('Error: '+e.message);
    }
  }
}

