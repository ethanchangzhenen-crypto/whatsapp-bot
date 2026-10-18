const { default: makeWASocket, useMultiFileAuthState } = require('@whiskeysockets/baileys')
const P = require('pino')
const express = require('express')
const QR = require('qrcode')
const app = express()
let qrData=''
app.get('/',(req,res)=>{ if(!qrData) return res.send('OK'); res.send(`<img src="${qrData}">`) })
app.listen(process.env.PORT||3000)

const ADMIN_NUMBERS = ['6597306863', '7306863'] // added short version for LID fix
const isAdmin = (jid) => {
 if(!jid) return false
 return ADMIN_NUMBERS.some(n => jid.includes(n))
}

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
let admin=isAdmin(sender) || isAdmin(jid) || isAdmin(target)

console.log(`MSG: ${t} | sender: ${sender} | jid: ${jid} | isAdmin: ${admin}`)

if(t==='!myid'){
await sock.sendMessage(jid,{text:`Your sender: ${sender}\nJID: ${jid}\nIsAdmin: ${admin}`})
return
}
if(t==='!check') await sock.sendMessage(jid,{text:'✅ Bot Online'})
else if(t==='!bal') await sock.sendMessage(jid,{text:`💰 $${getBal(sender)} | 🏠 ${getProps(sender).length} props`})
else if(t==='!menu'){
let menu=`🎰 KAI MENU

💰 !bal
🎁 !daily (24h)
🎰 !slots [amount]
🪙 !cf [amount] heads/tails
🎲 !dice [amount] 1-6
🏘️ !prop
🏠 !myprop
💵 !buy [id]
💰 !collect

Slots: 4x=15x (1%) | 3x=7x (5%) | 2x=2x (30%) | Lose 64%`
await sock.sendMessage(jid,{text:menu})
}
else if(t==='!daily'){
let last=lastDaily.get(sender)||0
let now=Date.now()
if(now-last<24*60*60*1000){
let left=24*60*60*1000-(now-last)
let h=Math.floor(left/3600000)
let m2=Math.floor((left%3600000)/60000)
return await sock.sendMessage(jid,{text:`⏰ Daily cooldown ${h}h ${m2}m`})
}
lastDaily.set(sender,now)
setBal(sender,getBal(sender)+500)
await sock.sendMessage(jid,{text:`🎁 +$500\n💰 $${getBal(sender)}`})
}
else if(t.startsWith('!addmoney')){
if(!admin) { console.log('Blocked addmoney not admin'); return }
let amt=parseInt(a[1])||parseInt(a[a.length-1])
if(isNaN(amt)) return await sock.sendMessage(jid,{text:'❌ Insert amount\nEx: !addmoney 5000'})
setBal(target,getBal(target)+amt); await sock.sendMessage(jid,{text:`✅ +$${amt} -> $${getBal(target)}`})
}
else if(t.startsWith('!removemoney')){
if(!admin) return
let amt=parseInt(a[1])||parseInt(a[a.length-1])
if(isNaN(amt)) return await sock.sendMessage(jid,{text:'❌ Insert amount'})
setBal(target,Math.max(0,getBal(target)-amt)); await sock.sendMessage(jid,{text:`✅ -$${amt} -> $${getBal(target)}`})
}
else if(t.startsWith('!setmoney')){
if(!admin) return
let amt=parseInt(a[1])||parseInt(a[a.length-1])
if(isNaN(amt)) return await sock.sendMessage(jid,{text:'❌ Insert amount'})
setBal(target,amt); await sock.sendMessage(jid,{text:`✅ Set $${amt}`})
}
else if(t.startsWith('!reset')){
if(!admin) return
if(t==='!resetall'){ balances.clear(); userProps.clear(); lastDaily.clear(); lastCollect.clear(); return await sock.sendMessage(jid,{text:'✅ RESET ALL'}) }
setBal(target,1000); userProps.set(target,[]); lastDaily.delete(target); lastCollect.delete(target); await sock.sendMessage(jid,{text:`✅ Reset to $1000`})
}
else if(t.startsWith('!giveprop')){
if(!admin) return
let id=parseInt(a[1])||parseInt(a[a.length-1])
let prop=PROPERTIES.find(p=>p.id===id); if(!prop) return await sock.sendMessage(jid,{text:'❌ Invalid id'})
let list=getProps(target); list.push(id); userProps.set(target,list); await sock.sendMessage(jid,{text:`✅ Gave ${prop.name}`})
}
else if(t.startsWith('!removeprop')){
if(!admin) return
let id=parseInt(a[1])||parseInt(a[a.length-1])
let list=getProps(target); userProps.set(target,list.filter(x=>x!==id)); await sock.sendMessage(jid,{text:`✅ Removed ${id}`})
}
else if(t.startsWith('!slots')){
if(!a[1] || isNaN(parseInt(a[1]))) return await sock.sendMessage(jid,{text:'❌ Insert amount Ex: !slots 100'})
let bet=parseInt(a[1]); if(bet<=0) return await sock.sendMessage(jid,{text:'❌ >0'})
if(getBal(sender)<bet) return await sock.sendMessage(jid,{text:`❌ No money $${getBal(sender)}`})
let pool=['🍒','🍋','🔔','💎','7️⃣','🍇','🍀']; let s=()=>pool[Math.floor(Math.random()*pool.length)]
let r=[s(),s(),s(),s()]
let roll=Math.random()*100
if(roll<1) r=[r[0],r[0],r[0],r[0]]
else if(roll<6){ let e=r[0]; let o=pool.filter(x=>x!==e)[Math.floor(Math.random()*5)]; r=[e,e,e,o].sort(()=>Math.random()-0.5) }
else if(roll<36){ let e=r[0]; r=[e,e,s(),s()].sort(()=>Math.random()-0.5) }
else{ while(new Set(r).size<4) r=[s(),s(),s(),s()] }
let counts={}; r.forEach(x=>counts[x]=(counts[x]||0)+1)
let max=Math.max(...Object.values(counts))
let mult=max===4?15:max===3?7:max===2?2:0
let txt=`🎰  ${r[0]}  ${r[1]}  ${r[2]}  ${r[3]}  🎰\n`
if(mult>0){ let win=bet*mult; setBal(sender,getBal(sender)+win); txt+=`🎉 ${max===4?'4 KIND 15x':max===3?'3 KIND 7x':'2 KIND 2x'} +$${win}\n💰 $${getBal(sender)}` }
else{ setBal(sender,getBal(sender)-bet); txt+=`💀 LOSE -$${bet}\n💰 $${getBal(sender)}` }
await sock.sendMessage(jid,{text:txt})
}
else if(t.startsWith('!cf')){
if(!a[1] || isNaN(parseInt(a[1]))) return await sock.sendMessage(jid,{text:'❌ Insert amount Ex: !cf 50 heads'})
if(!a[2]) return await sock.sendMessage(jid,{text:'❌ heads/tails'})
let bet=parseInt(a[1]); if(getBal(sender)<bet) return await sock.sendMessage(jid,{text:`❌ $${getBal(sender)}`})
let flip=Math.random()<0.5?'heads':'tails'
let guess=a[2].startsWith('h')?'heads':'tails'
if(flip===guess){ setBal(sender,getBal(sender)+bet); await sock.sendMessage(jid,{text:`🪙 ${flip.toUpperCase()}\nWIN +$${bet} $${getBal(sender)}`}) }
else{ setBal(sender,getBal(sender)-bet); await sock.sendMessage(jid,{text:`🪙 ${flip.toUpperCase()}\nLOSE -$${bet} $${getBal(sender)}`}) }
}
else if(t.startsWith('!dice')){
if(!a[1] || isNaN(parseInt(a[1]))) return await sock.sendMessage(jid,{text:'❌ Insert amount Ex: !dice 50 3'})
if(!a[2] || isNaN(parseInt(a[2]))) return await sock.sendMessage(jid,{text:'❌ Insert 1-6'})
let bet=parseInt(a[1]); let guess=parseInt(a[2])
if(guess<1||guess>6) return await sock.sendMessage(jid,{text:'❌ 1-6 only'})
if(getBal(sender)<bet) return await sock.sendMessage(jid,{text:`❌ $${getBal(sender)}`})
let roll=Math.floor(Math.random()*6)+1
if(roll===guess){ setBal(sender,getBal(sender)+bet*5); await sock.sendMessage(jid,{text:`🎲 ${roll}\nWIN +$${bet*5} $${getBal(sender)}`}) }
else{ setBal(sender,getBal(sender)-bet); await sock.sendMessage(jid,{text:`🎲 ${roll}\nLOSE -$${bet} $${getBal(sender)}`}) }
}
else if(t==='!prop'){
let txt='🏘️ SHOP\n\n'
PROPERTIES.forEach(p=>{ txt+=`${p.id}. ${p.name} - $${p.price} income $${p.income}/h\n` })
txt+='\n!buy [id]'
await sock.sendMessage(jid,{text:txt})
}
else if(t.startsWith('!buy')){
if(!a[1] || isNaN(parseInt(a[1]))) return await sock.sendMessage(jid,{text:'❌ Ex: !buy 1'})
let id=parseInt(a[1]); let prop=PROPERTIES.find(p=>p.id===id); if(!prop) return await sock.sendMessage(jid,{text:'❌ Invalid id'})
if(getBal(sender)<prop.price) return await sock.sendMessage(jid,{text:`❌ Need $${prop.price}`})
setBal(sender,getBal(sender)-prop.price)
let list=getProps(sender); list.push(id); userProps.set(sender,list)
await sock.sendMessage(jid,{text:`✅ Bought ${prop.name}\n💰 $${getBal(sender)}`})
}
else if(t==='!myprop'){
let list=getProps(sender); if(list.length===0) return await sock.sendMessage(jid,{text:'🏠 No props'})
let txt='🏠 YOUR PROPS:\n'
let income=0
list.forEach(id=>{ let p=PROPERTIES.find(x=>x.id===id); if(p){ txt+=`- ${p.name}\n`; income+=p.income } })
txt+=`\nIncome $${income}/h !collect`
await sock.sendMessage(jid,{text:txt})
}
else if(t==='!collect'){
let last=lastCollect.get(sender)||0
let now=Date.now()
if(now-last<60*60*1000){
let left=60*60*1000-(now-last)
let m=Math.floor(left/60000)
return await sock.sendMessage(jid,{text:`⏰ ${m}m left`})
}
let list=getProps(sender); if(list.length===0) return await sock.sendMessage(jid,{text:'No props'})
let income=0; list.forEach(id=>{ let p=PROPERTIES.find(x=>x.id===id); if(p) income+=p.income })
if(income===0) return await sock.sendMessage(jid,{text:'No income'})
lastCollect.set(sender,now)
setBal(sender,getBal(sender)+income)
await sock.sendMessage(jid,{text:`💵 +$${income}\n💰 $${getBal(sender)}`})
}
}catch(e){ console.log(e) }
})
}
start()
