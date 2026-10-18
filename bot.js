const { default: makeWASocket, useMultiFileAuthState } = require('@whiskeysockets/baileys')
const P = require('pino')
const express = require('express')
const QR = require('qrcode')
const app = express()
let qrData=''
app.get('/',(req,res)=>{ if(!qrData) return res.send('OK'); res.send(`<img src="${qrData}">`) })
app.listen(process.env.PORT||3000)

const ADMIN_NUMBERS = ['7014319182055', '7014319182055@lid', '6597306863']
const isAdmin = (jid) => { if(!jid) return false; return ADMIN_NUMBERS.some(n => jid.includes(n)) }
let botPaused = false

const balances=new Map()
const getBal=id=>{ if(!balances.has(id)) balances.set(id,1000); return balances.get(id) }
const setBal=(id,amt)=>balances.set(id,amt)
const lastDaily=new Map()
const userProps=new Map()
const getProps=id=>{ if(!userProps.has(id)) userProps.set(id,[]); return userProps.get(id) }
const lastCollect=new Map()

const PROPERTIES=[
{id:1,name:'🏚️ Shack',price:1000,income:50},
{id:2,name:'🏠 House',price:5000,income:300},
{id:3,name:'🏢 Apartment',price:15000,income:1000},
{id:4,name:'🏦 Bank',price:50000,income:4000},
{id:5,name:'🏰 Castle',price:200000,income:20000},
]

// CROPS
const CROPS=[
{id:1,name:'🌾 Wheat',price:500,grow:2*60*1000,sell:1000,rarity:'Common'},
{id:2,name:'🌽 Corn',price:2000,grow:5*60*1000,sell:4500,rarity:'Common'},
{id:3,name:'🍅 Tomato',price:8000,grow:15*60*1000,sell:20000,rarity:'Rare'},
{id:4,name:'🍓 Strawberry',price:25000,grow:30*60*1000,sell:75000,rarity:'Epic'},
{id:5,name:'🍄 Golden Shroom',price:100000,grow:60*60*1000,sell:400000,rarity:'Legendary'},
]
const userFarms=new Map() // id -> [{cropId, plantedAt, readyAt}]

// STOCKS
let STOCKS=[
{id:1,symbol:'KAI',name:'KaiCoin',price:100,base:100,vol:0.25},
{id:2,symbol:'MOON',name:'MoonCorp',price:500,base:500,vol:0.35},
{id:3,symbol:'DOGE2',name:'Doge2',price:50,base:50,vol:0.5},
{id:4,symbol:'GOLD',name:'Gold Inc',price:2000,base:2000,vol:0.15},
{id:5,symbol:'NUK',name:'NukeEnergy',price:10000,base:10000,vol:0.6},
]
const userStocks=new Map() // user -> Map stockId -> amount
function updateStocks(){
STOCKS=STOCKS.map(s=>{
let change=(Math.random()*2-1)*s.vol // -vol to +vol
let newPrice=Math.max(10, Math.floor(s.price*(1+change)))
return {...s, price:newPrice}
})
console.log('Stocks updated', STOCKS.map(s=>`${s.symbol} $${s.price}`).join(' '))
}
setInterval(updateStocks, 24*60*60*1000) // daily

// PETS
const PET_TYPES=[
{id:1,name:'🐶 Dog',boost:0.2},
{id:2,name:'🐱 Cat',boost:0.3},
{id:3,name:'🐉 Dragon',boost:0.8},
{id:4,name:'🦊 Fox',boost:0.5},
{id:5,name:'👑 Legendary Phoenix',boost:1.5},
]
const PET_ITEMS=[
{id:1,name:'💧 Water Bottle',type:'water',rarity:'Common',happy:5,price:100},
{id:2,name:'🦴 Bone',type:'food',rarity:'Common',happy:10,price:200},
{id:3,name:'🧸 Toy',type:'toy',rarity:'Common',happy:10,price:200},
{id:4,name:'🍖 Steak',type:'food',rarity:'Rare',happy:25,price:1500},
{id:5,name:'💎 Water',type:'water',rarity:'Rare',happy:20,price:1200},
{id:6,name:'🎾 Super Ball',type:'toy',rarity:'Rare',happy:25,price:1500},
{id:7,name:'🍰 Cake',type:'food',rarity:'Epic',happy:50,price:8000},
{id:8,name:'🏀 Epic Toy',type:'toy',rarity:'Epic',happy:50,price:8000},
{id:9,name:'👑 God Food',type:'food',rarity:'Legendary',happy:100,price:50000},
]
const userPets=new Map() // user -> {petId, happy:0-100, lastUpdate}
const userPetItems=new Map() // user -> [itemId]
function getPet(id){
let p=userPets.get(id)
if(!p) return null
let hours=(Date.now()-p.lastUpdate)/(60*60*1000)
p.happy=Math.max(0, p.happy - Math.floor(hours*2)) // -2 per hour
p.lastUpdate=Date.now()
userPets.set(id,p)
return p
}

async function start(){
const {state,saveCreds}=await useMultiFileAuthState('auth')
const sock=makeWASocket({auth:state,logger:P({level:'silent'})})
sock.ev.on('creds.update',saveCreds)
sock.ev.on('connection.update',async u=>{
if(u.qr){qrData=await QR.toDataURL(u.qr); console.log('QR')}
if(u.connection==='open'){qrData=''; console.log('CONNECTED')}
if(u.connection==='close') setTimeout(start,5000)
})
sock.ev.on('messages.upsert',async m=>{
try{
const msg=m.messages[0]; if(!msg.message) return
const jid=msg.key.remoteJid
const sender=msg.key.participant||jid
const raw=msg.message.conversation||msg.message.extendedTextMessage?.text||''
if(!raw) return
const t=raw.toLowerCase().trim()
const a=raw.trim().split(/\s+/)
let ctx=msg.message.extendedTextMessage?.contextInfo
let target=ctx?.mentionedJid?.[0] || ctx?.participant || sender
let admin=isAdmin(sender) || isAdmin(jid)

if(t==='!myid'){ await sock.sendMessage(jid,{text:`Your sender: ${sender}\nJID: ${jid}\nIsAdmin: ${admin}`}); return }
if(t==='!id'||t==='!getid'){ await sock.sendMessage(jid,{text:`ID: ${target}`}); return }
if(t==='!off'){ if(!admin) return; botPaused=true; await sock.sendMessage(jid,{text:'🔴 Bot OFF'}); return }
if(t==='!on'){ if(!admin) return; botPaused=false; await sock.sendMessage(jid,{text:'🟢 Bot ON'}); return }
if(botPaused) return

if(t==='!check') await sock.sendMessage(jid,{text:'✅ Bot Online'})
else if(t==='!bal') await sock.sendMessage(jid,{text:`💰 $${getBal(sender)}`})
else if(t==='!menu'){
await sock.sendMessage(jid,{text:`🎰 KAI MENU

💰 !bal | 🎁 !daily
🎰 !slots [amt] min10k 3% 5x
🪙 !cf [amt] h/t
🎲 !dice [amt] 1-6 min1k 5x
🏘️ !prop | 🏠 !myprop | 💵 !buy [id] | 💰 !collect
🌾 CROPS:
!crops | !buycrop [id] | !farm | !harvest
📈 STOCKS:
!stocks | !buystock [id] [qty] | !sellstock [id] [qty] | !mystocks
🐶 PETS:
!pet | !petshop | !buyitem [id] | !feed [id] (admin !spawnpet)`})
}
else if(t==='!daily'){
let last=lastDaily.get(sender)||0
if(Date.now()-last<24*60*60*1000){
let left=24*60*60*1000-(Date.now()-last)
let h=Math.floor(left/3600000)
return await sock.sendMessage(jid,{text:`⏰ ${h}h left`})
}
lastDaily.set(sender,Date.now())
let bonus=0
let pet=getPet(sender)
if(pet){ let type=PET_TYPES.find(p=>p.id===pet.petId); bonus=Math.floor(500*(pet.happy/100)*type.boost) }
let total=500+bonus
setBal(sender,getBal(sender)+total)
await sock.sendMessage(jid,{text:`🎁 Daily +$500${bonus?` +$${bonus} pet bonus`:''}\n💰 $${getBal(sender)}`})
}
else if(t.startsWith('!addmoney')||t.startsWith('!removemoney')||t.startsWith('!setmoney')||t.startsWith('!reset')){
if(!admin) return
if(t.startsWith('!addmoney')){ let amt=parseInt(a[a.length-1]); if(!isNaN(amt)){ setBal(target,getBal(target)+amt); await sock.sendMessage(jid,{text:`✅ +$${amt} -> $${getBal(target)}`}) } }
else if(t.startsWith('!removemoney')){ let amt=parseInt(a[a.length-1]); if(!isNaN(amt)){ setBal(target,Math.max(0,getBal(target)-amt)); await sock.sendMessage(jid,{text:`✅ -$${amt} -> $${getBal(target)}`}) } }
else if(t.startsWith('!setmoney')){ let amt=parseInt(a[a.length-1]); if(!isNaN(amt)){ setBal(target,amt); await sock.sendMessage(jid,{text:`✅ Set $${amt}`}) } }
else if(t.startsWith('!reset')){ if(t==='!resetall'){ balances.clear(); userProps.clear(); userFarms.clear(); userStocks.clear(); userPets.clear(); } else { setBal(target,1000); userProps.set(target,[]); } await sock.sendMessage(jid,{text:'✅ Reset'}) }
}
else if(t.startsWith('!slots')){
if(!a[1] || isNaN(parseInt(a[1]))) return await sock.sendMessage(jid,{text:'❌ !slots 10000'})
let bet=parseInt(a[1]); if(bet<10000) return await sock.sendMessage(jid,{text:'❌ Min 10k'}); if(getBal(sender)<bet) return await sock.sendMessage(jid,{text:`❌ $${getBal(sender)}`})
let pool=['🍒','🍋','🔔','💎','7️⃣','🍇','🍀']; let s=()=>pool[Math.floor(Math.random()*pool.length)]; let r=[s(),s(),s()]
if(Math.random()<0.03){ r=[r[0],r[0],r[0]] } else { while(r[0]===r[1]&&r[1]===r[2]){ r=[s(),s(),s()] } }
if(r[0]===r[1]&&r[1]===r[2]){ let win=bet*5; setBal(sender,getBal(sender)+win); await sock.sendMessage(jid,{text:`🎰 ${r[0]} ${r[1]} ${r[2]}\n🎉 WIN +$${win}\n💰 $${getBal(sender)}`}) } else { setBal(sender,getBal(sender)-bet); await sock.sendMessage(jid,{text:`🎰 ${r[0]} ${r[1]} ${r[2]}\n💀 LOSE -$${bet}\n💰 $${getBal(sender)}`}) }
}
else if(t.startsWith('!cf')){
if(!a[1]||isNaN(parseInt(a[1]))||!a[2]) return await sock.sendMessage(jid,{text:'❌ !cf 100 heads'})
let bet=parseInt(a[1]); if(getBal(sender)<bet) return await sock.sendMessage(jid,{text:`❌ $${getBal(sender)}`})
let flip=Math.random()<0.5?'heads':'tails'; let guess=a[2].startsWith('h')?'heads':'tails'
if(flip===guess){ setBal(sender,getBal(sender)+bet); await sock.sendMessage(jid,{text:`🪙 ${flip} WIN +$${bet}\n💰 $${getBal(sender)}`}) } else { setBal(sender,getBal(sender)-bet); await sock.sendMessage(jid,{text:`🪙 ${flip} LOSE -$${bet}\n💰 $${getBal(sender)}`}) }
}
else if(t.startsWith('!dice')){
if(!a[1]||isNaN(parseInt(a[1]))||!a[2]) return await sock.sendMessage(jid,{text:'❌ !dice 1000 3'})
let bet=parseInt(a[1]); let guess=parseInt(a[2]); if(bet<1000) return await sock.sendMessage(jid,{text:'❌ Min 1k'}); if(getBal(sender)<bet) return await sock.sendMessage(jid,{text:`❌ $${getBal(sender)}`})
let roll=Math.floor(Math.random()*6)+1
if(roll===guess){ let win=bet*5; setBal(sender,getBal(sender)+win); await sock.sendMessage(jid,{text:`🎲 ${roll} WIN +$${win}\n💰 $${getBal(sender)}`}) } else { setBal(sender,getBal(sender)-bet); await sock.sendMessage(jid,{text:`🎲 ${roll} vs ${guess} LOSE -$${bet}\n💰 $${getBal(sender)}`}) }
}
else if(t==='!prop'){ let txt='🏘️ SHOP\n'; PROPERTIES.forEach(p=>txt+=`${p.id}. ${p.name} $${p.price} inc $${p.income}/h\n`); await sock.sendMessage(jid,{text:txt}) }
else if(t.startsWith('!buy')){ let id=parseInt(a[1]); let p=PROPERTIES.find(x=>x.id===id); if(!p) return await sock.sendMessage(jid,{text:'❌ Invalid'}); if(getBal(sender)<p.price) return await sock.sendMessage(jid,{text:`❌ Need $${p.price}`}); setBal(sender,getBal(sender)-p.price); let l=getProps(sender); l.push(id); userProps.set(sender,l); await sock.sendMessage(jid,{text:`✅ Bought ${p.name}`}) }
else if(t==='!myprop'){ let l=getProps(sender); if(l.length===0) return await sock.sendMessage(jid,{text:'No props'}); let inc=0; let txt='🏠 Props:\n'; l.forEach(id=>{ let pr=PROPERTIES.find(x=>x.id===id); if(pr){ txt+=pr.name+'\n'; inc+=pr.income } }); txt+=`Inc $${inc}/h`; await sock.sendMessage(jid,{text:txt}) }
else if(t==='!collect'){
let last=lastCollect.get(sender)||0; if(Date.now()-last<60*60*1000) return await sock.sendMessage(jid,{text:'⏰ 1h cooldown'})
let l=getProps(sender); let inc=0; l.forEach(id=>{ let pr=PROPERTIES.find(x=>x.id===id); if(pr) inc+=pr.income })
if(inc===0) return await sock.sendMessage(jid,{text:'No props'})
let bonus=0; let pet=getPet(sender); if(pet){ let type=PET_TYPES.find(p=>p.id===pet.petId); bonus=Math.floor(inc*(pet.happy/100)*type.boost) }
lastCollect.set(sender,Date.now()); setBal(sender,getBal(sender)+inc+bonus); await sock.sendMessage(jid,{text:`💵 +$${inc}${bonus?` +$${bonus} pet`:''}\n💰 $${getBal(sender)}`})
}
// CROPS COMMANDS
else if(t==='!crops'||t==='!cropshop'){
let txt='🌾 CROPS SHOP\n\n'; CROPS.forEach(c=>{ txt+=`${c.id}. ${c.name} [${c.rarity}] - Buy $${c.price} Sell $${c.sell} - ${c.grow/60000}m\n` }); txt+='\n!buycrop [id]'; await sock.sendMessage(jid,{text:txt})
}
else if(t.startsWith('!buycrop')){
let id=parseInt(a[1]); let crop=CROPS.find(c=>c.id===id); if(!crop) return await sock.sendMessage(jid,{text:'❌ Invalid crop'})
if(getBal(sender)<crop.price) return await sock.sendMessage(jid,{text:`❌ Need $${crop.price}`})
setBal(sender,getBal(sender)-crop.price)
let farm=userFarms.get(sender)||[]; farm.push({cropId:id, plantedAt:Date.now(), readyAt:Date.now()+crop.grow}); userFarms.set(sender,farm)
await sock.sendMessage(jid,{text:`🌱 Planted ${crop.name} ready in ${crop.grow/60000}m\n💰 $${getBal(sender)}`})
}
else if(t==='!farm'){
let farm=userFarms.get(sender)||[]; if(farm.length===0) return await sock.sendMessage(jid,{text:'🌾 Farm empty'})
let txt='🌾 YOUR FARM:\n'; farm.forEach((f,i)=>{ let c=CROPS.find(x=>x.id===f.cropId); let ready=Date.now()>=f.readyAt; txt+=`${i+1}. ${c.name} - ${ready?'✅ READY':'⏳ '+Math.ceil((f.readyAt-Date.now())/1000)+'s'}\n` }); await sock.sendMessage(jid,{text:txt})
}
else if(t==='!harvest'){
let farm=userFarms.get(sender)||[]; if(farm.length===0) return await sock.sendMessage(jid,{text:'Nothing'})
let earned=0; let left=[]; farm.forEach(f=>{ if(Date.now()>=f.readyAt){ let c=CROPS.find(x=>x.id===f.cropId); earned+=c.sell } else { left.push(f) } })
if(earned===0) return await sock.sendMessage(jid,{text:'⏳ Nothing ready'})
userFarms.set(sender,left); setBal(sender,getBal(sender)+earned); await sock.sendMessage(jid,{text:`🌾 Harvest +$${earned}\n💰 $${getBal(sender)}`})
}
// STOCKS
else if(t==='!stocks'){
let txt='📈 STOCK MARKET (updates daily)\n\n'; STOCKS.forEach(s=>{ txt+=`${s.id}. $${s.symbol} ${s.name} - $${s.price} (vol ${s.vol*100}%)\n` }); txt+='\n!buystock [id] [qty]\n!sellstock [id] [qty]'; await sock.sendMessage(jid,{text:txt})
}
else if(t.startsWith('!buystock')){
let id=parseInt(a[1]); let qty=parseInt(a[2])||1; let stock=STOCKS.find(s=>s.id===id); if(!stock) return await sock.sendMessage(jid,{text:'❌ Invalid stock'})
let cost=stock.price*qty; if(getBal(sender)<cost) return await sock.sendMessage(jid,{text:`❌ Need $${cost}`})
setBal(sender,getBal(sender)-cost)
let port=userStocks.get(sender); if(!port){ port=new Map(); userStocks.set(sender,port) }
port.set(id,(port.get(id)||0)+qty)
await sock.sendMessage(jid,{text:`📈 Bought ${qty}x ${stock.symbol} $${cost}\n💰 $${getBal(sender)}`})
}
else if(t.startsWith('!sellstock')){
let id=parseInt(a[1]); let qty=parseInt(a[2])||1; let stock=STOCKS.find(s=>s.id===id); if(!stock) return await sock.sendMessage(jid,{text:'❌ Invalid'})
let port=userStocks.get(sender); if(!port||!port.get(id)||port.get(id)<qty) return await sock.sendMessage(jid,{text:'❌ Not enough stocks'})
let earn=stock.price*qty; port.set(id,port.get(id)-qty); if(port.get(id)===0) port.delete(id); setBal(sender,getBal(sender)+earn)
await sock.sendMessage(jid,{text:`📉 Sold ${qty}x ${stock.symbol} +$${earn}\n💰 $${getBal(sender)}`})
}
else if(t==='!mystocks'){
let port=userStocks.get(sender); if(!port||port.size===0) return await sock.sendMessage(jid,{text:'No stocks'})
let txt='📊 YOUR STOCKS:\n'; let total=0; port.forEach((qty,id)=>{ let s=STOCKS.find(x=>x.id===id); if(s){ let val=s.price*qty; total+=val; txt+=`${s.symbol} x${qty} = $${val}\n` } }); txt+=`Total $${total}`; await sock.sendMessage(jid,{text:txt})
}
// PETS
else if(t.startsWith('!spawnpet')){
if(!admin) return
let petId=Math.floor(Math.random()*PET_TYPES.length)+1
if(a[1]&&!isNaN(parseInt(a[1]))) petId=parseInt(a[1])
let petType=PET_TYPES.find(p=>p.id===petId)||PET_TYPES[0]
userPets.set(target,{petId:petType.id, happy:50, lastUpdate:Date.now()})
await sock.sendMessage(jid,{text:`🐾 Spawned ${petType.name} for user\nHappiness 50%\nUse !pet to check\n!petshop to buy food/toys`})
}
else if(t==='!pet'){
let pet=getPet(sender); if(!pet) return await sock.sendMessage(jid,{text:'❌ No pet ask admin !spawnpet'})
let type=PET_TYPES.find(p=>p.id===pet.petId)
let boost=Math.floor(type.boost*pet.happy)
await sock.sendMessage(jid,{text:`🐾 PET: ${type.name}\n❤️ Happy: ${pet.happy}%\n📈 Boost: +${boost}% extra on collect/daily\n💡 Buy items !petshop and !feed [id] to increase happiness\nHappiness -2% per hour`})
}
else if(t==='!petshop'){
let txt='🐾 PET SHOP\n\n'; PET_ITEMS.forEach(it=>{ txt+=`${it.id}. ${it.name} [${it.rarity}] [${it.type}] +${it.happy}% happy - $${it.price}\n` }); txt+='\n!buyitem [id]\n!feed [id] to use'; await sock.sendMessage(jid,{text:txt})
}
else if(t.startsWith('!buyitem')){
let id=parseInt(a[1]); let item=PET_ITEMS.find(i=>i.id===id); if(!item) return await sock.sendMessage(jid,{text:'❌ Invalid item'})
if(getBal(sender)<item.price) return await sock.sendMessage(jid,{text:`❌ Need $${item.price}`})
setBal(sender,getBal(sender)-item.price)
let inv=userPetItems.get(sender)||[]; inv.push(id); userPetItems.set(sender,inv)
await sock.sendMessage(jid,{text:`✅ Bought ${item.name}\nUse !feed ${id}\n💰 $${getBal(sender)}`})
}
else if(t.startsWith('!feed')||t.startsWith('!useitem')){
let id=parseInt(a[1]); if(isNaN(id)) return await sock.sendMessage(jid,{text:'❌ !feed [item id] check !petshop for ids'})
let inv=userPetItems.get(sender)||[]; let idx=inv.indexOf(id); if(idx===-1) return await sock.sendMessage(jid,{text:'❌ You dont own that item !buyitem first'})
let pet=getPet(sender); if(!pet) return await sock.sendMessage(jid,{text:'❌ No pet'})
let item=PET_ITEMS.find(i=>i.id===id); inv.splice(idx,1); userPetItems.set(sender,inv)
pet.happy=Math.min(100, pet.happy+item.happy); pet.lastUpdate=Date.now(); userPets.set(sender,pet)
await sock.sendMessage(jid,{text:`🐾 Used ${item.name} +${item.happy}% happy\n❤️ Now ${pet.happy}%\nBoost ${(PET_TYPES.find(p=>p.id===pet.petId).boost*pet.happy).toFixed(0)}%`})
}
}catch(e){ console.log(e) }
})
}
start()
