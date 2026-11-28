// Remplit la base jetable via l'API réelle. Usage : node populate.mjs <port>
const BASE = `http://localhost:${process.argv[2] || 6120}/api`;
const PW = 'Audit2026!x';
let token = '';
async function call(method, path, body, tk = token) {
  const r = await fetch(BASE + path, { method, headers: { 'Content-Type': 'application/json', ...(tk ? { Authorization: `Bearer ${tk}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = { raw: t.slice(0, 200) }; }
  if (!r.ok) console.log(`!! ${method} ${path} ${r.status}`, JSON.stringify(j).slice(0, 220));
  return j;
}
const login = async (u) => (await call('POST', '/auth/login', { username: u, password: PW }, '')).data?.token;
token = await login('admin');
if (!token) { console.log('login KO'); process.exit(1); }

const roles = (await call('GET', '/admin/users/roles')).data || [];
console.log('roles', roles.map((r) => `${r.id}:${r.nom}`).join(' '));
const rid = (n) => roles.find((r) => r.nom === n)?.id;

const loc2 = (await call('POST', '/stock-locations', { code: 'MAG-2', nom: 'Boutique Yopougon' })).data;
const dep = (await call('POST', '/stock-locations', { code: 'DEP-1', nom: 'Dépôt Vridi' })).data;
console.log('locations', loc2?.id, dep?.id);

for (const [u, role, nom, locs] of [
  ['gerant', 'manager', 'Awa Gérante', [1, loc2?.id, dep?.id]],
  ['caissier', 'caissier', 'Yao Caissier', [1]],
  ['vendeur', 'magasin_staff', 'Salif Vendeur', [1]],
  ['depot', 'depot_staff', 'Koffi Dépôt', [dep?.id]],
  ['lecteur', 'viewer', 'Lecteur', [1]],
]) await call('POST', '/admin/users', { username: u, password: PW, role_id: rid(role), email: `${u}@audit.local`, nom_complet: nom, location_ids: locs.filter(Boolean) });

const P = [
  ['INF-LAP-001', 'Ordinateur portable HP ProBook 450', 'Informatique', 450000, 595000, 14, 3],
  ['INF-LAP-002', 'Ordinateur portable Lenovo ThinkPad E14', 'Informatique', 520000, 669000, 9, 2],
  ['INF-ECR-001', 'Écran Dell 24 pouces', 'Informatique', 95000, 135000, 18, 4],
  ['INF-IMP-001', 'Imprimante Epson EcoTank L3250', 'Informatique', 130000, 175000, 10, 2],
  ['INF-STO-001', 'Disque SSD Samsung 1 To', 'Informatique', 65000, 89000, 30, 5],
  ['INF-ACC-001', 'Souris Logitech B100', 'Informatique', 3000, 5000, 120, 20],
  ['INF-ACC-002', 'Câble HDMI 2 m', 'Informatique', 1500, 3500, 150, 25],
  ['INF-CON-001', 'Cartouche encre noire 664', 'Informatique', 4500, 7500, 60, 10],
  ['ALI-RIZ-025', 'Riz parfumé sac 25 kg', 'Alimentaire', 13500, 15500, 400, 50],
  ['ALI-RIZ-005', 'Riz parfumé sachet 5 kg', 'Alimentaire', 2900, 3500, 300, 40],
  ['ALI-HUI-CAR', 'Huile raffinée carton 12 x 0,9 L', 'Alimentaire', 13200, 15000, 220, 30],
  ['ALI-HUI-BTL', 'Huile raffinée bouteille 0,9 L', 'Alimentaire', 1100, 1400, 500, 60],
  ['ALI-SUC-001', 'Sucre en morceaux carton 25 x 1 kg', 'Alimentaire', 17500, 19500, 160, 20],
  ['ALI-LAI-001', 'Lait concentré carton 48 boîtes', 'Alimentaire', 21000, 23500, 140, 20],
  ['ALI-TOM-001', 'Tomate concentrée carton 24 boîtes', 'Alimentaire', 9500, 11000, 180, 20],
  ['ALI-PAT-001', 'Spaghetti carton 20 x 500 g', 'Alimentaire', 6800, 8000, 210, 25],
  ['HAB-CHE-M-BL', 'Chemise homme blanche taille M', 'Habillement', 5500, 10000, 25, 5],
  ['HAB-CHE-L-BL', 'Chemise homme blanche taille L', 'Habillement', 5500, 10000, 22, 5],
  ['HAB-CHE-XL-BL', 'Chemise homme blanche taille XL', 'Habillement', 5500, 10000, 12, 5],
  ['HAB-JEA-32-BL', 'Jean homme bleu taille 32', 'Habillement', 7000, 14000, 30, 5],
  ['HAB-JEA-34-BL', 'Jean homme bleu taille 34', 'Habillement', 7000, 14000, 24, 5],
  ['HAB-ROB-S-RO', 'Robe pagne rouge taille S', 'Habillement', 9000, 18000, 15, 3],
  ['HAB-BAS-42-NO', 'Basket noire pointure 42', 'Habillement', 12000, 22000, 18, 3],
];
const ids = {};
for (const [reference, nom, categorie, prix_achat, prix_vente, q, stock_min] of P) {
  const r = await call('POST', '/produits', { reference, nom, categorie, prix_achat, prix_vente, stock_min, location_id: 1, initial_stock: q });
  ids[reference] = r.data?.id;
}
console.log('produits', Object.values(ids).filter(Boolean).length);

const T = [
  ['KONE Aboubacar', true, false, 0], ['TRAORE Mariama', true, false, 0], ['Cabinet Cygnus Consulting', true, false, 3000000],
  ['Alimentation Chez Tantie (demi-gros)', true, false, 1500000], ['Boutique Le Bon Prix Bouaké', true, false, 2500000],
  ['École Numérique Bouaké', true, false, 5000000], ['Friperie Adjamé Mode', true, false, 0], ['SARL TechAvenir', true, false, 4000000],
  ['Distribution Riz Vridi', false, true, 0], ['HP Distribution Abidjan', false, true, 0], ['Textile Import Dubaï', false, true, 0],
  ['CompuServices (client et fournisseur)', true, true, 1000000],
];
const tid = {};
let n = 1;
for (const [raison_sociale, est_client, est_fournisseur, credit_max] of T) {
  const r = await call('POST', '/tiers', { raison_sociale, est_client, est_fournisseur, credit_max, telephone: `+22507${String(10000000 + n * 12345).slice(0, 8)}`, adresse: 'Abidjan', delai_paiement: '30 jours' });
  tid[raison_sociale] = r.data?.id; n++;
}
console.log('tiers', Object.values(tid).filter(Boolean).length);
console.log(JSON.stringify({ ids, tid }));
