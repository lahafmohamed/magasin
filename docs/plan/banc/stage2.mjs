const BASE=`http://localhost:${process.argv[2]}/api`, PW='Audit2026!x'; let token='';
async function call(m,p,b){const r=await fetch(BASE+p,{method:m,headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},body:b?JSON.stringify(b):undefined});const t=await r.text();let j;try{j=JSON.parse(t)}catch{j={raw:t.slice(0,200)}};if(!r.ok)console.log(`!! ${m} ${p} ${r.status}`,JSON.stringify(j).slice(0,220));return j;}
token=(await call('POST','/auth/login',{username:'admin',password:PW})).data.token;
const locs=(await call('GET','/stock-locations')).data; console.log(locs.map(l=>`${l.id}:${l.code}`).join(' '));
const L=Object.fromEntries(locs.map(l=>[l.code,l.id]));
const us=(await call('GET','/admin/users')).data; const U=Object.fromEntries(us.map(u=>[u.username,u.id]));
const asg={gerant:[L['MAG-1'],L['MAG-2'],L['DEP-1']],caissier:[L['MAG-1']],vendeur:[L['MAG-1']],depot:[L['DEP-1']],lecteur:[L['MAG-1']]};
for(const [u,ids] of Object.entries(asg)) if(U[u]) await call('PUT','/admin/users/'+U[u],{location_ids:ids});
// stock dans le dépôt et la boutique 2
for(const id of [1,3,6,9,11,13,14,17,20,23]){ await call('PATCH',`/produits/${id}/stock`,{quantite:40,location_id:L['DEP-1'],raison:'Stock initial dépôt'}); await call('PATCH',`/produits/${id}/stock`,{quantite:8,location_id:L['MAG-2'],raison:'Stock initial boutique 2'}); }
const c=await call('POST','/caisse/ouvrir',{magasin_id:L['MAG-1'],fond_initial:50000}); console.log('caisse',JSON.stringify(c).slice(0,160));
