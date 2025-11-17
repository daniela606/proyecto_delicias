
async function api(path, opts){
  const res = await fetch('/api' + path, Object.assign({headers:{'Content-Type':'application/json'}}, opts));
  if(!res.ok) throw new Error(await res.text());
  return res.json();
}


if(document.getElementById('btnLogin')){
  document.getElementById('btnLogin').onclick = async ()=>{
    const usuario = document.getElementById('usuario').value;
    const password = document.getElementById('password').value;
    const rol = typeof rolSeleccionado !== 'undefined' ? rolSeleccionado : document.getElementById('rol')?.value;
    if(!usuario || !password || !rol){
      document.getElementById('msg').innerText = 'Completa todos los campos';
      return;
    }
    try{
      const u = await api('/login',{method:'POST',body:JSON.stringify({usuario,password,rol})});
      localStorage.setItem('user', JSON.stringify(u));
      // Redirigir según el rol
      if (u.rol === 'COCINA') {
        location.href = 'cocina.html';
      } else {
        location.href = 'mesas.html';
      }
    }catch(e){
      document.getElementById('msg').innerText = 'Usuario, contraseña o rol incorrectos';
    }
  }
}


async function loadProducts(renderTargetId, showAdd=true){
  const container = document.getElementById(renderTargetId);
  if(!container) return;
  const prods = await api('/products');
  container.innerHTML = '';
  prods.forEach(p=>{
    const div = document.createElement('div');
    div.className='producto';
    div.innerHTML = `<img src="${p.imagen||'https://via.placeholder.com/200x100'}"><h4>${p.nombre}</h4>
      <div>$ ${Number(p.precio).toFixed(2)}</div>
      ${showAdd?`<div><input type="number" min="1" value="1" id="q_${p.id}" style="width:60px"><button class="btn" onclick="addToCart(${p.id},'${p.nombre}',${p.precio})">Agregar</button></div>`:''}`;
    container.appendChild(div);
  });
}


function getCart(){ return JSON.parse(localStorage.getItem('cart')||'[]'); }
function saveCart(c){ localStorage.setItem('cart', JSON.stringify(c)); }
function addToCart(id,nombre,precio){
  const q = Number(document.getElementById('q_'+id)?.value || 1);
  const cart = getCart();
  const idx = cart.findIndex(x=>x.id_producto==id);
  if(idx>=0) cart[idx].cantidad += q; else cart.push({id_producto:id,nombre,cantidad:q,precio,observacion:''});
  saveCart(cart);
  renderCart();
  // Intentar persistir inmediatamente en la mesa (si conocemos la mesa)
  try{
    // Determinar mesa: buscar parámetro ?mesa= en la URL, o usar localStorage 'currentMesa', o por defecto '1'
    const urlParams = new URLSearchParams(window.location.search);
    const mesa = urlParams.get('mesa') || localStorage.getItem('currentMesa') || '1';
    const user = JSON.parse(localStorage.getItem('user')||'{}');
    // Llamada al endpoint que crea/usa pedido pendiente y añade el detalle
    api(`/mesa/${mesa}/items`, {method:'POST', body: JSON.stringify({id_producto:id, cantidad:q, observacion:'', id_usuario: user.id || null})})
      .then(resp=>{
        console.log('Persistido en mesa', mesa, resp);
        // Guardar detalleId en el carrito para futuras actualizaciones
        if(resp && resp.detalleId){
          const c = getCart();
          const idx = c.findIndex(x=>x.id_producto==id);
          if(idx>=0 && !c[idx].detalleId){
            c[idx].detalleId = resp.detalleId;
            saveCart(c);
          }
        }
      }).catch(err=>{
        console.warn('No se pudo persistir en mesa (se guardó localmente):', err.message);
      });
  }catch(e){ console.warn('Error persistiendo item en mesa', e.message); }
}
function renderCart(){
  const itemsEl = document.getElementById('items');
  const cart = getCart();
  // actualizar badge y total del botón de pedido (si existen)
  const badge = document.getElementById('orderBadge');
  const orderTotalEl = document.getElementById('orderTotal');
  const itemCount = cart.reduce((s,i)=>s+Number(i.cantidad||0),0);
  const totalCalc = cart.reduce((s,i)=>s + (Number(i.precio||0) * Number(i.cantidad||0)), 0);
  if(badge){ if(itemCount>0){ badge.style.display='inline-block'; badge.innerText = itemCount; } else { badge.style.display='none'; } }
  if(orderTotalEl){ orderTotalEl.innerText = '$' + totalCalc.toFixed(2); }
  if(!itemsEl) return;
  itemsEl.innerHTML = '';
  let total=0;
  cart.forEach((it, idx)=>{
    const div = document.createElement('div'); div.className='item';
    // si el item viene de la BD tendrá detalleId
    const detalleId = it.detalleId || it.id || null;
    const observacion = it.observacion || '';
    
    // Crear contenedor para nombre, precio y observación
    const infoDiv = document.createElement('div'); infoDiv.style.flex='1';
    infoDiv.innerHTML = `<strong>${it.nombre}</strong><div class="small">$${Number(it.precio).toFixed(2)}</div>`;
    if(observacion) {
      const obsSpan = document.createElement('div');
      obsSpan.style.fontSize = '12px';
      obsSpan.style.color = '#e74c3c';
      obsSpan.style.marginTop = '4px';
      obsSpan.style.fontStyle = 'italic';
      obsSpan.innerText = '📝 ' + observacion;
      infoDiv.appendChild(obsSpan);
    }
    div.appendChild(infoDiv);
    
    const controls = document.createElement('div'); controls.style.display='flex'; controls.style.gap='8px'; controls.style.alignItems='center'; controls.style.flexWrap='wrap';
    const qty = document.createElement('input'); qty.type='number'; qty.min=1; qty.value = it.cantidad; qty.style.width='60px';
    qty.onchange = async ()=>{
      const newQ = Number(qty.value);
      if(isNaN(newQ) || newQ<1) { qty.value = it.cantidad; return; }
      // actualizar local
      const c = getCart(); c[idx].cantidad = newQ; saveCart(c);
      // si tiene detalleId, persistir cambio en servidor
      if(detalleId){
        try{
          await api(`/mesa/${localStorage.getItem('currentMesa')}/items/${detalleId}`, {method:'PATCH', body: JSON.stringify({cantidad:newQ, observacion:c[idx].observacion||''})});
        }catch(e){ console.warn('No se pudo actualizar cantidad en servidor', e.message); }
      }
      renderCart();
    };
    
    // Botón para editar observación
    const editObsBtn = document.createElement('button');
    editObsBtn.className='btn';
    editObsBtn.innerText='📝';
    editObsBtn.style.fontSize='14px';
    editObsBtn.style.padding='4px 8px';
    editObsBtn.style.minWidth='32px';
    editObsBtn.title='Agregar/editar nota';
    editObsBtn.onclick = async ()=>{
      const newObs = prompt('Agregar nota (ej: sin cebolla, sin queso):', observacion);
      if(newObs !== null) {
        const c = getCart();
        c[idx].observacion = newObs;
        saveCart(c);
        // si tiene detalleId, persistir en servidor
        if(detalleId){
          try{
            await api(`/mesa/${localStorage.getItem('currentMesa')}/items/${detalleId}`, {method:'PATCH', body: JSON.stringify({cantidad:c[idx].cantidad, observacion:newObs})});
            console.log('Observación actualizada exitosamente');
          }catch(e){ 
            console.warn('No se pudo actualizar observación en servidor', e.message);
          }
        }
        renderCart();
      }
    };
    
    const delBtn = document.createElement('button'); delBtn.className='btn'; delBtn.innerText='Eliminar';
    delBtn.style.fontSize='14px';
    delBtn.style.padding='4px 8px';
    delBtn.onclick = async ()=>{
      if(!confirm('Eliminar item?')) return;
      // eliminar local
      const c = getCart();
      const removed = c.splice(idx,1)[0];
      saveCart(c);
      // si tiene detalleId, eliminar en servidor
      if(detalleId){
        try{
          await api(`/mesa/${localStorage.getItem('currentMesa')}/items/${detalleId}`, {method:'DELETE'});
        }catch(e){ console.warn('No se pudo eliminar en servidor', e.message); }
      }
      renderCart();
    };
    
    controls.appendChild(qty);
    controls.appendChild(editObsBtn);
    controls.appendChild(delBtn);
    div.appendChild(controls);
    itemsEl.appendChild(div);
    total += Number(it.precio) * Number(it.cantidad);
  });
  document.getElementById('total').innerText = total.toFixed(2);
}

if(document.getElementById('productos')) loadProducts('productos');
if(document.getElementById('featured')) loadProducts('featured', false);
if(document.getElementById('items')) renderCart();

function initMenuForMesa(mesa){
  loadProducts('productos', true);
  renderCart();
  // marcar mesa actual en localStorage para que addToCart pueda persistir automáticamente
  try{ localStorage.setItem('currentMesa', String(mesa)); }catch(e){}
  // sincronizar con la mesa pendiente en el servidor: traer items y mezclarlos al carrito local
  (async function syncMesa(){
    try{
      const resp = await api(`/mesa/${mesa}`);
      if(resp && resp.items && resp.items.length){
        // Si el carrito local está vacío, cargar desde el servidor
        const local = getCart();
        if(local.length === 0){
          // Carrito vacío: llenar con items del servidor
          const serverItems = resp.items.map(it=>({
            id_producto: it.id_producto,
            nombre: it.nombre || '',
            cantidad: it.cantidad,
            precio: Number(it.precio || 0),
            observacion: it.observacion || '',
            detalleId: it.id
          }));
          saveCart(serverItems);
          renderCart();
        }
        // Si ya hay items locales, no mezclar (evita duplicados)
      }
    }catch(e){
      console.warn('No se pudo sincronizar la mesa:', e.message || e);
    }
  })();
  document.getElementById('send').onclick = async ()=>{
    const user = JSON.parse(localStorage.getItem('user')||'{"id":1}');
    const cart = getCart();
    if(cart.length===0){ alert('Añade productos'); return; }
    const mesa = new URLSearchParams(window.location.search).get('mesa') || localStorage.getItem('currentMesa') || '1';
    try{
      // Deshabilitar botón para evitar múltiples clicks
      const btn = document.getElementById('send');
      btn.disabled = true;
      btn.innerText = 'Enviando a cocina...';
      
      console.log('Enviando pedido a cocina para mesa', mesa);
      console.log('Carrito:', cart);
      
      // Enviar directamente a cocina sin verificar primero
      const resp = await api(`/mesa/${mesa}/enviar-cocina`, {method:'POST'});
      console.log('Respuesta enviar-cocina:', resp);
      
      if(resp.ok || resp.msg){
        localStorage.removeItem('cart');
        try{ localStorage.removeItem('currentMesa'); }catch(e){}
        
        // Esperar un poco para asegurar que se guardó en la BD
        await new Promise(resolve => setTimeout(resolve, 800));
        
        // Redirigir a mesas.html
        window.location.href='mesas.html';
      } else {
        throw new Error('No se pudo enviar el pedido');
      }
    }catch(e){
      console.error('Error en send:', e);
      alert('Error: '+e.message);
      const btn = document.getElementById('send');
      btn.disabled = false;
      btn.innerText = 'Enviar a Cocina';
    }
  }
}


function goToCart(){ location.href = 'mesa.html?mesa=1'; }

// Modal handlers for viewing the pedido
(function(){
  const btn = document.getElementById('btnViewOrder');
  const modal = document.getElementById('orderModal');
  const close = document.getElementById('closeModal');
  const cancelAllBtn = document.getElementById('cancelAllOrder');
  const sendToCajaBtn = document.getElementById('sendToCaja');
  
  if(btn && modal){
    btn.onclick = ()=>{ modal.setAttribute('aria-hidden','false'); renderCart(); };
  }
  if(close && modal){
    close.onclick = ()=>{ modal.setAttribute('aria-hidden','true'); };
  }
  
  // Manejador para enviar a caja
  if(sendToCajaBtn){
    sendToCajaBtn.onclick = async ()=>{
      const cart = getCart();
      if(cart.length===0){ alert('Añade productos'); return; }
      if(!confirm('¿Enviar este pedido a Caja?')) return;
      const mesa = new URLSearchParams(window.location.search).get('mesa') || localStorage.getItem('currentMesa') || '1';
      const items = cart.map(i=>({id_producto:i.id_producto,cantidad:i.cantidad,observacion:i.observacion}));
      const user = JSON.parse(localStorage.getItem('user')||'{}');
      try{
        await api('/pedido/caja', {method:'POST', body: JSON.stringify({id_usuario:user.id, mesa:mesa, observaciones:'', items})});
        localStorage.removeItem('cart');
        try{ localStorage.removeItem('currentMesa'); }catch(e){}
        modal.setAttribute('aria-hidden','true');
        // Limpiar la campanita de notificación para esta mesa
        sessionStorage.setItem('mesaLiberada', mesa);
        alert('Pedido enviado a Caja');
        location.href='mesas.html';
      }catch(e){
        alert('Error: '+e.message);
      }
    };
  }
  
  // Manejador para cancelar todo el pedido
  if(cancelAllBtn){
    cancelAllBtn.onclick = async ()=>{
      if(!confirm('¿Estás seguro de que deseas cancelar TODO el pedido de esta mesa?')) return;
      try{
        const mesa = new URLSearchParams(window.location.search).get('mesa') || localStorage.getItem('currentMesa') || '1';
        await api(`/mesa/${mesa}/pedido`, {method:'DELETE'});
        localStorage.removeItem('cart');
        modal.setAttribute('aria-hidden','true');
        alert('Pedido cancelado completamente');
        location.href='mesas.html';
      }catch(e){
        alert('Error al cancelar pedido: '+e.message);
      }
    };
  }
  
  // cerrar al hacer click fuera
  window.addEventListener('click', (e)=>{ if(e.target === modal) modal.setAttribute('aria-hidden','true'); });
  // cerrar con ESC
  window.addEventListener('keyup', (e)=>{ if(e.key === 'Escape' && modal && modal.getAttribute('aria-hidden')==='false') modal.setAttribute('aria-hidden','true'); });
})();
