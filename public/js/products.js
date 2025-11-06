// Usa la función api() definida en app.js

async function loadAdminProducts(){
  const container = document.getElementById('listado');
  if(!container) return;
  try{
    const prods = await api('/products');
    container.innerHTML = '';
    prods.forEach(p=>{
      const div = document.createElement('div');
      div.className='producto';
      div.innerHTML = `<img src="${p.imagen||'https://via.placeholder.com/200x100'}"><h4>${p.nombre}</h4><div>$ ${Number(p.precio).toFixed(2)}</div><div class="small">${p.descripcion||''}</div>`;
      container.appendChild(div);
    });
  }catch(e){
    container.innerText = 'Error cargando productos: '+e.message;
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
      alert('Producto agregado');
    }catch(e){
      alert('Error: '+e.message);
    }
  }
}
