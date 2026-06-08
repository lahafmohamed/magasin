#!/usr/bin/env node
/**
 * seed-hitek-demo.mjs - Unified schema seed
 */
import pg from 'pg';
import 'dotenv/config';
const { Pool } = pg;
const pool = new Pool({
  host: process.env.DB_HOST||'localhost',
  port: parseInt(process.env.DB_PORT||'5432'),
  user: process.env.DB_USER||'postgres',
  password: process.env.DB_PASSWORD||'',
  database: process.env.DB_NAME||'magasin_db',
});

const WIPE = [
  'acompte_applications','acomptes_clients','allocation_audit','audit_log',
  'compensations','compte_client_lignes','compte_fournisseur_lignes',
  'demandes_reapprovisionnement_lignes','demandes_reapprovisionnement','depenses',
  'document_lignes','factures_avoir','facture_avoir_lignes',
  'bon_livraison_lignes','bons_livraison','devis_lignes','devis','facture_lignes',
  'factures','paiements','paiements_fournisseur','facture_fournisseur_lignes',
  'factures_fournisseur','reception_lignes','receptions','commande_lignes',
  'commandes_fournisseur','mouvements_caisse','mouvements_stock',
  'internal_stock_request_lignes','internal_stock_requests',
  'stock_transfer_lignes','stock_transfers','stock_par_location','produits','tiers',
];

const CATS = ['Laptops','Desktops','Ecrans','Composants','Stockage','Imprimantes','Reseau','Peripheriques','Accessoires'];

const PRODUITS = [
  ['INF-LAP-001','HP ProBook 450 G10','i5-1335U 16Go 512Go SSD','Laptops',450000,595000,8,3],
  ['INF-LAP-002','Dell Latitude 5440','i7-1365U 16Go 512Go SSD','Laptops',620000,795000,5,2],
  ['INF-LAP-003','Lenovo ThinkPad E14','Ryzen5 16Go 512Go SSD','Laptops',520000,669000,6,2],
  ['INF-LAP-004','ASUS VivoBook 15','i3-1215U 8Go 256Go SSD','Laptops',280000,365000,12,4],
  ['INF-LAP-005','MacBook Air M3','M3 8Go 256Go SSD','Laptops',720000,945000,3,1],
  ['INF-LAP-006','Acer Aspire 5','i5-1235U 8Go 512Go SSD','Laptops',330000,429000,10,3],
  ['INF-DSK-001','HP EliteDesk 800 G9','i7-12700T 32Go DDR5 1To','Desktops',580000,740000,4,2],
  ['INF-DSK-002','Dell OptiPlex 3000','i5-12500T 16Go 512Go','Desktops',390000,499000,6,2],
  ['INF-DSK-003','Lenovo ThinkCentre M70q','i3-12100T 8Go 256Go','Desktops',310000,399000,5,2],
  ['INF-MON-001','Dell P2422H 24 FHD','IPS 1920x1080 60Hz','Ecrans',95000,135000,12,4],
  ['INF-MON-002','LG UltraGear 27 QHD','IPS 2560x1440 165Hz','Ecrans',180000,245000,6,2],
  ['INF-MON-003','Samsung 32 UHD 4K','VA 3840x2160 HDR400','Ecrans',220000,295000,4,2],
  ['INF-MON-004','Acer V227Q 21.5','IPS 1920x1080 75Hz','Ecrans',68000,89000,18,5],
  ['INF-RAM-001','Corsair 16Go DDR4','2x8Go 3200MHz','Composants',28000,42000,15,5],
  ['INF-RAM-002','Kingston Fury 32Go DDR5','2x16Go 5600MHz','Composants',72000,98000,10,3],
  ['INF-RAM-003','Crucial 8Go DDR4','SODIMM 3200MHz','Composants',14000,20000,25,8],
  ['INF-STO-001','Samsung 980 Pro 1To','PCIe4.0 NVMe','Stockage',65000,89000,18,5],
  ['INF-STO-002','WD Green 480Go SSD','SATA III 545Mo/s','Stockage',22000,32000,30,8],
  ['INF-STO-003','Seagate 2To HDD','3.5 SATA 7200RPM','Stockage',28000,38000,20,6],
  ['INF-STO-004','WD Elements 1To USB','Disque externe','Stockage',35000,48000,25,8],
  ['INF-STO-005','SanDisk 64Go USB','Cle USB 3.0','Stockage',4500,7500,80,20],
  ['INF-PRT-001','HP LaserJet M404dn','Laser mono 38ppm','Imprimantes',165000,215000,6,2],
  ['INF-PRT-002','Epson EcoTank L3250','Jet encre WiFi','Imprimantes',130000,175000,8,3],
  ['INF-PRT-003','Brother HL-L2350DW','Laser WiFi 32ppm','Imprimantes',110000,145000,5,2],
  ['INF-NET-001','TP-Link Archer AX55','WiFi6 AX3000','Reseau',55000,79000,12,4],
  ['INF-NET-002','TP-Link Switch 8P','Gigabit metal','Reseau',18000,28000,18,5],
  ['INF-NET-003','Ubiquiti UniFi AP','WiFi AC1750','Reseau',95000,129000,6,2],
  ['INF-KBD-001','Logitech MX Keys','Clavier sans fil AZERTY','Peripheriques',55000,79000,20,5],
  ['INF-KBD-002','Logitech K120','Clavier filaire USB','Peripheriques',6000,9500,50,15],
  ['INF-MSE-001','Logitech MX Master 3S','Souris sans fil','Peripheriques',48000,69000,25,8],
  ['INF-MSE-002','Logitech B100','Souris filaire','Peripheriques',3000,5000,80,20],
  ['INF-WEB-001','Logitech C920','Webcam 1080p','Peripheriques',38000,55000,12,4],
  ['INF-CBL-001','HDMI 2.1 2m','4K120Hz nylon','Accessoires',3500,6500,100,25],
  ['INF-CBL-002','USB-C 1m PD','100W data 10Gbps','Accessoires',4000,7500,80,20],
  ['INF-UPS-001','APC Back-UPS 600VA','600VA/360W','Accessoires',55000,75000,10,3],
  ['INF-SAC-001','Sac laptop 15.6','Impermeable trolley','Accessoires',18000,28000,20,5],
];

const TIERS = [
  {code:'CLI-001',rs:'KONE Aboubacar',prenom:'Aboubacar',client:true,fourn:false,tel:'+22507010101',email:'aboubacar.kone@gmail.com',adr:'Cocody Riviera 2 Abidjan'},
  {code:'CLI-002',rs:'TRAORE Mariama',prenom:'Mariama',client:true,fourn:false,tel:'+22505220202',email:'mariama.traore@outlook.com',adr:'Yopougon Selmer Abidjan'},
  {code:'CLI-003',rs:'COULIBALY Jean-Pierre',prenom:'Jean-Pierre',client:true,fourn:false,tel:'+22507330303',email:'jp.coulibaly@yahoo.fr',adr:'Marcory Zone 4 Abidjan'},
  {code:'CLI-004',rs:'SARL TechAvenir CI',prenom:null,client:true,fourn:false,tel:'+22527230000',email:'compta@techavenir.ci',adr:'Plateau Immeuble Alpha 2000'},
  {code:'CLI-005',rs:'Cabinet Cygnus Consulting',prenom:null,client:true,fourn:false,tel:'+22521445566',email:'achat@cygnus.ci',adr:'Zone 4C Marcory Abidjan'},
  {code:'CLI-006',rs:'Ecole Numerique Bouake',prenom:null,client:true,fourn:false,tel:'+22531890066',email:'direction@ecolenumerique.ci',adr:'Koko Bouake'},
  {code:'FRN-001',rs:'HP Cote Ivoire SA',prenom:null,client:false,fourn:true,tel:'+22520301010',email:'commercial@hp-ci.com',adr:'Zone Industrielle Vridi Abidjan'},
  {code:'FRN-002',rs:'Dell Distribution WAFR',prenom:null,client:false,fourn:true,tel:'+22520302020',email:'orders@dell-wafr.com',adr:'Treichville Port Abidjan'},
  {code:'FRN-003',rs:'AccessoiresPro Distrib',prenom:null,client:false,fourn:true,tel:'+22520303030',email:'ventes@accpro.ci',adr:'Adjame Commerce Abidjan'},
  {code:'MIX-001',rs:'CompuServices SARL',prenom:null,client:true,fourn:true,tel:'+22527990099',email:'contact@compuserv.ci',adr:'Plateau Bd Republique Abidjan'},
];

const d = (off=0)=>{const x=new Date();x.setDate(x.getDate()+off);return x.toISOString().slice(0,10);};
const nFac=n=>'FAC-2026-'+String(n).padStart(5,'0');
const nDev=n=>'DEV-2026-'+String(n).padStart(5,'0');
const nCF=n=>'CF-2026-'+String(n).padStart(5,'0');
const nRec=n=>'REC-2026-'+String(n).padStart(5,'0');
const nFF=n=>'FF-2026-'+String(n).padStart(5,'0');

async function main(){
  const db=await pool.connect();
  try{
    const {rows:[{db:dbName,usr}]}=await db.query('SELECT current_database() AS db,current_user AS usr');
    console.log('\n DB: '+dbName+' @ '+usr);
    await db.query('BEGIN');
    console.log('\n[1] Vidage...');
    const ex=[];
    for(const tbl of WIPE){const{rows}=await db.query('SELECT to_regclass($1) AS r',['public.'+tbl]);if(rows[0].r)ex.push(tbl);}
    if(ex.length)await db.query('TRUNCATE TABLE '+ex.join(',')+' RESTART IDENTITY CASCADE');
    console.log('    '+ex.length+' tables videes');
    
    const {rows:[{id:locId}]}=await db.query('SELECT id FROM stock_locations WHERE est_principal=TRUE AND actif=TRUE LIMIT 1');
    const {rows:[{id:magId}]}=await db.query('SELECT id FROM magasins ORDER BY id LIMIT 1');
    console.log('    location_id='+locId+' magasin_id='+magId);
    
    console.log('\n[2] Categories...');
    const catId={};
    for(const nom of CATS){const{rows}=await db.query('INSERT INTO categories(nom)VALUES($1)RETURNING id',[nom]);catId[nom]=rows[0].id;}
    console.log('    '+CATS.length+' categories');
    
    console.log('\n[3] Produits...');
    const p={};
    for(const[ref,nom,desc,cat,pa,pv,stk,smin]of PRODUITS){
      const{rows}=await db.query('INSERT INTO produits(reference,nom,description,categorie_id,prix_achat,prix_vente,stock,stock_minimum)VALUES($1,$2,$3,$4,$5,$6,$7,$8)RETURNING id',[ref,nom,desc,catId[cat],pa,pv,stk,smin]);
      p[ref]=rows[0].id;
      await db.query('INSERT INTO stock_par_location(produit_id,location_id,quantite)VALUES($1,$2,$3)',[p[ref],locId,stk]);
    }
    console.log('    '+PRODUITS.length+' produits');
    
    console.log('\n[4] Tiers...');
    const t={};
    for(const x of TIERS){
      const{rows}=await db.query('INSERT INTO tiers(code,raison_sociale,prenom,est_client,est_fournisseur,telephone,email,adresse)VALUES($1,$2,$3,$4,$5,$6,$7,$8)ON CONFLICT(code)DO UPDATE SET raison_sociale=EXCLUDED.raison_sociale RETURNING id',[x.code,x.rs,x.prenom||null,x.client,x.fourn,x.tel,x.email,x.adr]);
      t[x.code]=rows[0].id;
    }
    console.log('    '+TIERS.length+' tiers');
    
    console.log('\n[5] Devis...');
    const mkDev=async(num,tid,dateF,dateE,st,sous,notes)=>{
      const{rows}=await db.query('INSERT INTO devis(numero_devis,tiers_id,date_devis,date_validite,statut,sous_total,total,notes,location_id)VALUES($1,$2,$3,$4,$5,$6,$6,$7,$8)RETURNING id',[num,tid,dateF,dateE,st,sous,notes,locId]);
      return rows[0].id;
    };
    const mkDevL=async(did,pid,desc,qte,pu)=>{
      await db.query('INSERT INTO document_lignes(document_type,document_id,produit_id,description,quantite,prix_unitaire,total_ligne)VALUES($1,$2,$3,$4,$5,$6,$7)',['devis',did,pid,desc,qte,pu,qte*pu]);
    };
    const d1=await mkDev(nDev(1),t['CLI-001'],d(-20),d(10),'brouillon',498000,'Laptop usage perso');
    await mkDevL(d1,p['INF-LAP-006'],'Acer Aspire 5',1,429000);
    await mkDevL(d1,p['INF-MSE-001'],'Logitech MX Master',1,69000);
    const d2=await mkDev(nDev(2),t['CLI-004'],d(-15),d(15),'envoye',3650000,'5 postes travail');
    await mkDevL(d2,p['INF-LAP-001'],'HP ProBook x5',5,595000);
    await mkDevL(d2,p['INF-MON-001'],'Dell P2422H x5',5,135000);
    const d3=await mkDev(nDev(3),t['CLI-005'],d(-30),d(-15),'accepte',2454000,'Infra reseau + laptops');
    await mkDevL(d3,p['INF-LAP-002'],'Dell Latitude x3',3,795000);
    await mkDevL(d3,p['INF-NET-002'],'Switch 8P',1,28000);
    await mkDevL(d3,p['INF-NET-001'],'Routeur AX55',1,79000);
    const d4=await mkDev(nDev(4),t['CLI-006'],d(-45),d(-30),'refuse',7300000,'20 laptops budget');
    await mkDevL(d4,p['INF-LAP-004'],'ASUS VivoBook x20',20,365000);
    const d5=await mkDev(nDev(5),t['CLI-003'],d(-65),d(-35),'converti',959000,'MacBook + cables');
    await mkDevL(d5,p['INF-LAP-005'],'MacBook Air M3',1,945000);
    await mkDevL(d5,p['INF-CBL-002'],'USB-C 1m',1,7500);
    await mkDevL(d5,p['INF-CBL-001'],'HDMI 2.1 2m',1,6500);
    console.log('    5 devis OK');
    
    console.log('\n[6] Factures + paiements...');
    const mkFac=async(num,tid,did,dateF,dateE,sous,notes)=>{
      const{rows}=await db.query('INSERT INTO factures(numero_facture,tiers_id,devis_id,date_facture,date_echeance,sous_total,total,statut,notes,location_id,magasin_id)VALUES($1,$2,$3,$4,$5,$6,$6,$7,$8,$9,$10)RETURNING id',[num,tid,did,dateF,dateE,sous,'en_attente',notes,locId,magId]);
      return rows[0].id;
    };
    const mkFacL=async(fid,pid,desc,qte,pu)=>{
      await db.query('INSERT INTO document_lignes(document_type,document_id,produit_id,description,quantite,prix_unitaire,total_ligne)VALUES($1,$2,$3,$4,$5,$6,$7)',['facture',fid,pid,desc,qte,pu,qte*pu]);
    };
    const mkPay=async(fid,montant,mode,dateP)=>{
      await db.query('INSERT INTO paiements(facture_id,montant,methode_paiement,date_paiement,source)VALUES($1,$2,$3,$4,$5)',[fid,montant,mode,dateP,'direct']);
      await db.query('UPDATE factures SET statut=$1,montant_paye=$2 WHERE id=$3',[montant===await db.query('SELECT total FROM factures WHERE id=$1',[fid]).then(r=>r.rows[0].total)?'payee':'partielle',montant,fid]);
    };
    const f1=await mkFac(nFac(1),t['CLI-001'],null,d(-40),d(-10),650000,'Vente comptoir');
    await mkFacL(f1,p['INF-LAP-001'],'HP ProBook',1,595000);
    await mkFacL(f1,p['INF-WEB-001'],'Webcam',1,55000);
    await mkPay(f1,650000,'cheque',d(-40));
    const f2=await mkFac(nFac(2),t['CLI-004'],d2,d(-10),d(20),3650000,'Suite DEV-2026-00002');
    await mkFacL(f2,p['INF-LAP-001'],'HP ProBook x5',5,595000);
    await mkFacL(f2,p['INF-MON-001'],'Dell P2422H x5',5,135000);
    await mkPay(f2,2000000,'virement',d(-5));
    const f3=await mkFac(nFac(3),t['CLI-005'],d3,d(-28),d(-14),2454000,'Infra direction');
    await mkFacL(f3,p['INF-LAP-002'],'Dell Latitude x3',3,795000);
    await mkFacL(f3,p['INF-NET-002'],'Switch 8P',1,28000);
    await mkFacL(f3,p['INF-NET-001'],'Routeur AX55',1,79000);
    await mkPay(f3,2454000,'cheque',d(-20));
    await db.query('UPDATE devis SET facture_id=$1,statut=$2 WHERE id=$3',[f3,'converti',d3]);
    const f4=await mkFac(nFac(4),t['CLI-002'],null,d(-3),d(27),237000,'Periph bureau');
    await mkFacL(f4,p['INF-MON-004'],'Acer V227Q',1,89000);
    await mkFacL(f4,p['INF-KBD-001'],'MX Keys',1,79000);
    await mkFacL(f4,p['INF-MSE-001'],'MX Master 3S',1,69000);
    const f5=await mkFac(nFac(5),t['CLI-006'],null,d(-7),d(23),3650000,'10 laptops');
    await mkFacL(f5,p['INF-LAP-004'],'ASUS VivoBook x10',10,365000);
    await mkPay(f5,730000,'orange_money',d(-6));
    const f6=await mkFac(nFac(6),t['CLI-003'],d5,d(-60),d(-30),959000,'MacBook + cables');
    await mkFacL(f6,p['INF-LAP-005'],'MacBook Air M3',1,945000);
    await mkFacL(f6,p['INF-CBL-002'],'USB-C',1,7500);
    await mkFacL(f6,p['INF-CBL-001'],'HDMI',1,6500);
    await mkPay(f6,959000,'wave',d(-60));
    await db.query('UPDATE devis SET facture_id=$1,statut=$2 WHERE id=$3',[f6,'converti',d5]);
    const f7=await mkFac(nFac(7),t['MIX-001'],null,d(-5),d(25),714000,'Desktop + imprimante');
    await mkFacL(f7,p['INF-DSK-002'],'OptiPlex 3000',1,499000);
    await mkFacL(f7,p['INF-PRT-001'],'HP LaserJet',1,215000);
    const f8=await mkFac(nFac(8),t['CLI-001'],null,d(-15),d(15),131000,'Upgrade');
    await mkFacL(f8,p['INF-RAM-001'],'Corsair 16Go',1,42000);
    await mkFacL(f8,p['INF-STO-001'],'Samsung 980 Pro',1,89000);
    await mkPay(f8,131000,'mtn_money',d(-15));
    console.log('    8 factures OK');
    
    console.log('\n[7] Commandes fournisseur...');
    const mkCF=async(num,tid,dateC,dateE,st,total,notes)=>{
      const{rows}=await db.query('INSERT INTO commandes_fournisseur(numero_commande,tiers_id,date_commande,date_livraison_prevue,statut,sous_total,notes)VALUES($1,$2,$3,$4,$5,$6,$7)RETURNING id',[num,tid,dateC,dateE,st,total,notes]);
      return rows[0].id;
    };
    const mkCFL=async(cid,pid,qte,pu)=>{
      await db.query('INSERT INTO commande_lignes(commande_id,produit_id,quantite,prix_unitaire,total_ligne)VALUES($1,$2,$3,$4,$5)',[cid,pid,qte,pu,qte*pu]);
    };
    const cf1=await mkCF(nCF(1),t['FRN-001'],d(-60),d(-45),'livree',5450000,'Reappro HP');
    await mkCFL(cf1,p['INF-LAP-001'],10,450000);await mkCFL(cf1,p['INF-MON-001'],10,95000);
    const cf2=await mkCF(nCF(2),t['FRN-002'],d(-45),d(-30),'livree',3460000,'Dell + RAM');
    await mkCFL(cf2,p['INF-LAP-002'],5,620000);await mkCFL(cf2,p['INF-RAM-001'],10,28000);await mkCFL(cf2,p['INF-RAM-002'],5,72000);
    const cf3=await mkCF(nCF(3),t['FRN-003'],d(-10),d(5),'en_attente',665000,'Accessoires');
    await mkCFL(cf3,p['INF-CBL-001'],50,3500);await mkCFL(cf3,p['INF-CBL-002'],40,4000);await mkCFL(cf3,p['INF-KBD-002'],30,6000);await mkCFL(cf3,p['INF-MSE-002'],50,3000);
    const cf4=await mkCF(nCF(4),t['FRN-001'],d(-2),d(10),'validee',1100000,'Imprimantes + APC');
    await mkCFL(cf4,p['INF-PRT-001'],5,165000);await mkCFL(cf4,p['INF-UPS-001'],5,55000);
    const cf5=await mkCF(nCF(5),t['MIX-001'],d(-25),d(-15),'livree',1575000,'Desktops + ecrans');
    await mkCFL(cf5,p['INF-DSK-002'],3,390000);await mkCFL(cf5,p['INF-MON-001'],3,135000);
    console.log('    5 commandes OK');
    
    console.log('\n[8] Receptions...');
    const mkRec=async(num,cid,dateR)=>{
      const{rows}=await db.query('INSERT INTO receptions(numero_reception,commande_id,date_reception,location_id)VALUES($1,$2,$3,$4)RETURNING id',[num,cid,dateR,locId]);
      return rows[0].id;
    };
    const mkRecL=async(rid,pid,qcmd,qrec,pu)=>{
      await db.query('INSERT INTO reception_lignes(reception_id,produit_id,quantite_commandee,quantite_recue,cout_unitaire,total_ligne,ecart)VALUES($1,$2,$3,$4,$5,$6,$7)',[rid,pid,qcmd,qrec,pu,qrec*pu,qrec-qcmd]);
    };
    const r1=await mkRec(nRec(1),cf1,d(-45));
    await mkRecL(r1,p['INF-LAP-001'],10,10,450000);await mkRecL(r1,p['INF-MON-001'],10,10,95000);
    const r2=await mkRec(nRec(2),cf2,d(-30));
    await mkRecL(r2,p['INF-LAP-002'],5,4,620000);await mkRecL(r2,p['INF-RAM-001'],10,10,28000);await mkRecL(r2,p['INF-RAM-002'],5,5,72000);
    const r3=await mkRec(nRec(3),cf5,d(-15));
    await mkRecL(r3,p['INF-DSK-002'],3,3,390000);await mkRecL(r3,p['INF-MON-001'],3,3,135000);
    console.log('    3 receptions OK');
    
    console.log('\n[9] Factures fournisseur...');
    const mkFF=async(num,tid,rid,dateF,dateE,st,total,notes)=>{
      const{rows}=await db.query('INSERT INTO factures_fournisseur(tiers_id,reception_id,numero_facture_fournisseur,numero_facture_interne,date_facture,date_echeance,sous_total,total,statut,condition_paiement,notes)VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)RETURNING id',[tid,rid,num,num,dateF,dateE,total,total,st,'comptant',notes]);
      return rows[0].id;
    };
    const mkFFL=async(fid,pid,desc,qte,pu)=>{
      await db.query('INSERT INTO facture_fournisseur_lignes(facture_id,produit_id,description,quantite,prix_unitaire,total_ligne)VALUES($1,$2,$3,$4,$5,$6)',[fid,pid,desc,qte,pu,qte*pu]);
    };
    const mkPayF=async(fid,tid,montant,mode,dateP)=>{
      await db.query('INSERT INTO paiements_fournisseur(facture_id,montant,methode_paiement,date_paiement,source)VALUES($1,$2,$3,$4,$5)',[fid,montant,mode,dateP,'direct']);
      await db.query('UPDATE factures_fournisseur SET statut=$1,montant_paye=$2 WHERE id=$3',[montant>=await db.query('SELECT total FROM factures_fournisseur WHERE id=$1',[fid]).then(r=>r.rows[0].total)?'payee':'partiellement_payee',montant,fid]);
    };
    const ff1=await mkFF('HP-INV-2026-0441',t['FRN-001'],r1,d(-44),d(-14),'payee',5450000,'Laptops + ecrans HP');
    await mkFFL(ff1,p['INF-LAP-001'],'HP ProBook',10,450000);await mkFFL(ff1,p['INF-MON-001'],'Dell P2422H',10,95000);
    await mkPayF(ff1,t['FRN-001'],5450000,'virement',d(-14));
    const ff2=await mkFF('DELL-WAFR-2026-0088',t['FRN-002'],r2,d(-29),d(31),'partiellement_payee',3120000,'Dell + RAM');
    await mkFFL(ff2,p['INF-LAP-002'],'Dell Latitude',4,620000);await mkFFL(ff2,p['INF-RAM-001'],'Corsair',10,28000);await mkFFL(ff2,p['INF-RAM-002'],'Kingston',5,72000);
    await mkPayF(ff2,t['FRN-002'],1500000,'cheque',d(-20));
    const ff4=await mkFF('COMPU-2026-0017',t['MIX-001'],r3,d(-14),d(16),'payee',1575000,'Desktops + ecrans');
    await mkFFL(ff4,p['INF-DSK-002'],'OptiPlex 3000',3,390000);await mkFFL(ff4,p['INF-MON-001'],'Dell P2422H',3,135000);
    await mkPayF(ff4,t['MIX-001'],1575000,'espece',d(-14));
    console.log('    3 factures fournisseur OK');
    
    await db.query('COMMIT');
    const cnt=await Promise.all([
      db.query('SELECT COUNT(*)::int n FROM categories'),db.query('SELECT COUNT(*)::int n FROM produits'),
      db.query('SELECT COUNT(*)::int n FROM tiers'),db.query('SELECT COUNT(*)::int n FROM devis'),
      db.query('SELECT COUNT(*)::int n FROM factures'),db.query('SELECT COUNT(*)::int n FROM paiements'),
      db.query('SELECT COUNT(*)::int n FROM commandes_fournisseur'),db.query('SELECT COUNT(*)::int n FROM receptions'),
      db.query('SELECT COUNT(*)::int n FROM factures_fournisseur'),db.query('SELECT COUNT(*)::int n FROM document_lignes'),
    ]);
    const[cntCat,cntPr,cntTi,cntD,cntF,cntP,cntCf,cntR,cntFf,cntL]=cnt.map(x=>x.rows[0].n);
    console.log('\n==========================================');
    console.log('  HITEK DEMO - RESUME SEED');
    console.log('==========================================');
    console.log('  Categories:'+cntCat+'  Produits:'+cntPr+'  Tiers:'+cntTi);
    console.log('  Devis:'+cntD+'  Factures:'+cntF+'  Paiements:'+cntP);
    console.log('  CmdFourn:'+cntCf+'  Receptions:'+cntR+'  FactFourn:'+cntFf);
    console.log('  Lignes docs:'+cntL);
    console.log('==========================================\n');
  }catch(err){
    await db.query('ROLLBACK').catch(()=>{});
    console.error('ERREUR:'+err.message);
    if(err.detail)console.error('Detail:'+err.detail);
    process.exitCode=1;
  }finally{
    db.release();await pool.end();
  }
}
main();
