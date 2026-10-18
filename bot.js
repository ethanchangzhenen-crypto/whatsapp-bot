const { default: makeWASocket, useMultiFileAuthState } = require('@whiskeysockets/baileys')
const P = require('pino')
const express = require('express')
const QR = require('qrcode')
const app = express()
let qrData=''
app.get('/',(req,res)=>{ if(!qrData) return res.send('OK'); res.send(`<img src="${qrData}">`) })
app.listen(process.env.PORT||3000)

const ADMIN_NUMBERS = ['65'] // CHANGE YOUR NUMBER
const isAdmin = (jid) => ADMIN_NUMBERS.some(n => jid.includes(n))

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
let target=msg.message.extendedTextMessage?.contextInfo?.mentionedJid?.[0] || msg.message.extendedTextMessage?.contextInfo?.participant || jid
let admin=isAdmin(sender)

if(t==='!check') await sock.sendMessage(jid,{text:'✅ Bot Online'})
else if(t==='!bal') await sock.sendMessage(jid,{text:`💰 $${getBal(jid)} | 🏠 ${getProps(jid).length} props`})
else if(t==='!menu'){
let menu=`🎰 KAI MENU

💰 !bal
🎁 !daily (24h cooldown)
🎰 !slots [amount]
🪙 !cf [amount] heads/tails
🎲 !dice [amount] 1-6
🏘️ !prop - shop
🏠 !myprop - your props
💵 !buy [id] - buy prop
💰 !collect - collect income`
if(admin) menu+=`\n\n👑 ADMIN:\n!addmoney [amt]\n!removemoney [amt]\n!setmoney [amt]\n!reset / !resetall\n!giveprop [id]\n!removeprop [id]\n(reply to user)`
await sock.sendMessage(jid,{text:menu})
}

// DAILY WITH COOLDOWN
else if(t==='!daily'){
let last=lastDaily.get(jid)||0
let now=Date.now()
let diff=now-last
if(diff<24*60*60*1000){
let left=24*60*60*1000-diff
let h=Math.floor(left/3600000)
let m=Math.floor((left%3600000)/60000)
return await sock.sendMessage(jid,{text:`⏰ Daily cooldown\nWait ${h}h ${m}m`})
}
lastDaily.set(jid,now)
setBal(jid,getBal(jid)+500)
await sock.sendMessage(jid,{text:`🎁 +$500 Daily!\n💰 $${getBal(jid)}`})
}

// ADMIN
else if(t.startsWith('!addmoney')){
if(!admin) return await sock.sendMessage(jid,{text:'Admin only'})
let amt=parseInt(a[a.length-1]); if(isNaN(amt)) return await sock.sendMessage(jid,{text:'❌ Insert amount\nEx: !addmoney 5000'})
setBal(target,getBal(target)+amt); await sock.sendMessage(jid,{text:`👑 +$${amt} -> $${getBal(target)}`})
}
else if(t.startsWith('!removemoney')){
if(!admin) return await sock.sendMessage(jid,{text:'Admin only'})
let amt=parseInt(a[a.length-1]); if(isNaN(amt)) return await sock.sendMessage(jid,{text:'❌ Insert amount'})
setBal(target,Math.max(0,getBal(target)-amt)); await sock.sendMessage(jid,{text:`👑 -$${amt} -> $${getBal(target)}`})
}
else if(t.startsWith('!setmoney')){
if(!admin) return await sock.sendMessage(jid,{text:'Admin only'})
let amt=parseInt(a[a.length-1]); if(isNaN(amt)) return await sock.sendMessage(jid,{text:'❌ Insert amount'})
setBal(target,amt); await sock.sendMessage(jid,{text:`👑 Set $${amt}`})
}
else if(t.startsWith('!reset')){
if(!admin) return await sock.sendMessage(jid,{text:'Admin only'})
if(t==='!resetall'){ balances.clear(); userProps.clear(); lastDaily.clear(); return await sock.sendMessage(jid,{text:'👑 RESET ALL'}) }
setBal(target,1000); userProps.set(target,[]); await sock.sendMessage(jid,{text:`👑 Reset to $1000`})
}
else if(t.startsWith('!giveprop')){
if(!admin) return await sock.sendMessage(jid,{text:'Admin only'})
let id=parseInt(a[a.length-1]); let prop=PROPERTIES.find(p=>p.id===id); if(!prop) return await sock.sendMessage(jid,{text:'❌ Invalid prop id'})
let list=getProps(target); list.push(id); userProps.set(target,list); await sock.sendMessage(jid,{text:`👑 Gave ${prop.name} to user`})
}
else if(t.startsWith('!removeprop')){
if(!admin) return await sock.sendMessage(jid,{text:'Admin only'})
let id=parseInt(a[a.length-1]); let list=getProps(target); userProps.set(target,list.filter(x=>x!==id)); await sock.sendMessage(jid,{text:`👑 Removed prop ${id}`})
}

// SLOTS 1%/5%/30%/64%
else if(t.startsWith('!slots')){
if(!a[1] || isNaN(parseInt(a[1]))) return await sock.sendMessage(jid,{text:'❌ Please insert amount\nEx: !slots 100'})
let bet=parseInt(a[1]); if(bet<=0) return await sock.sendMessage(jid,{text:'❌ Amount must be >0'})
if(getBal(jid)<bet) return await sock.sendMessage(jid,{text:`❌ No money $${getBal(jid)}`})
let pool=['🍒','🍋','🔔','💎','7️⃣','🍇','🍀']; let s=()=>pool[Math.floor(Math.random()*pool.length)]
let r=[s(),s(),s(),s()]
let roll=Math.random()*100
if(roll<1) r=[r[0],r[0],r[0],r[0]]
else if(roll<6){ let e=r[0]; let o=pool.filter(x=>x!==e)[Math.floor(Math.random()*5)]; r=[e,e,e,o].sort(()=>Math.random()-0.5) }
else if(roll<36){ let e=r[0]; r=[e,e,s(),s()].sort(()=>Math.random()-0.5) }
else{ while(new Set(r).size<4) r=[s(),s(),s(),s()] }
let counts={}; r.forEach(x=>counts[x]=(counts[x]||0)+1)
let max=Math.max(...Object.values(counts))
let mult=max===4?100:max===3?20:max===2?2:0
let txt=`🎰  ${r[0]}  ${r[1]}  ${r[2]}  ${r[3]}  🎰\n`
if(mult>0){ let win=bet*mult; setBal(jid,getBal(jid)+win); txt+=`🎉 ${max===4?'JACKPOT 100x':max===3?'TRIPLE 20x':'DOUBLE 2x'} +$${win}\n💰 $${getBal(jid)}` }
else{ setBal(jid,getBal(jid)-bet); txt+=`💀 LOSE -$${bet}\n💰 $${getBal(jid)}` }
await sock.sendMessage(jid,{text:txt})
}
else if(t.startsWith('!cf')){
if(!a[1] || isNaN(parseInt(a[1]))) return await sock.sendMessage(jid,{text:'❌ Please insert amount\nEx: !cf 50 heads'})
if(!a[2]) return await sock.sendMessage(jid,{text:'❌ Choose heads/tails\nEx: !cf 50 heads'})
let bet=parseInt(a[1]); if(getBal(jid)<bet) return await sock.sendMessage(jid,{text:`❌ No money $${getBal(jid)}`})
let flip=Math.random()<0.5?'heads':'tails'
let guess=a[2].startsWith('h')?'heads':'tails'
if(flip===guess){ setBal(jid,getBal(jid)+bet); await sock.sendMessage(jid,{text:`🎰  🪙  ${flip.toUpperCase()}  🪙  🎰\nWIN +$${bet} $${getBal(jid)}`}) }
else{ setBal(jid,getBal(jid)-bet); await sock.sendMessage(jid,{text:`🎰  🪙  ${flip.toUpperCase()}  🪙  🎰\nLOSE -$${bet} $${getBal(jid)}`}) }
}
else if(t.startsWith('!dice')){
if(!a[1] || isNaN(parseInt(a[1]))) return await sock.sendMessage(jid,{text:'❌ Please insert amount\nEx: !dice 50 3'})
if(!a[2] || isNaN(parseInt(a[2]))) return await sock.sendMessage(jid,{text:'❌ Insert number 1-6\nEx: !dice 50 3'})
let bet=parseInt(a[1]); let guess=parseInt(a[2])
if(guess<1||guess>6) return await sock.sendMessage(jid,{text:'❌ 1-6 only'})
if(getBal(jid)<bet) return await sock.sendMessage(jid,{text:`❌ No money $${getBal(jid)}`})
let roll=Math.floor(Math.random()*6)+1
if(roll===guess){ setBal(jid,getBal(jid)+bet*5); await sock.sendMessage(jid,{text:`🎰  🎲  ${roll}  🎲  🎰\nWIN +$${bet*5} $${getBal(jid)}`}) }
else{ setBal(jid,getBal(jid)-bet); await sock.sendMessage(jid,{text:`🎰  🎲  ${roll}  🎲  🎰\nLOSE -$${bet} (you guessed ${guess}) $${getBal(jid)}`}) }
}

// PROPERTIES
else if(t==='!prop'){
let txt='🏘️ PROPERTY SHOP\n\n'
PROPERTIES.forEach(p=>{ txt+=`${p.id}. ${p.name} - $${p.price} (income $${p.income}/collect)\n` })
txt+='\nBuy: !buy [id]\nCollect income every 1 hour: !collect'
await sock.sendMessage(jid,{text:txt})
}
else if(t.startsWith('!buy')){
if(!a[1] || isNaN(parseInt(a[1]))) return await sock.sendMessage(jid,{text:'❌ Insert prop id\nEx: !buy 1'})
let id=parseInt(a[1]); let prop=PROPERTIES.find(p=>p.id===id); if(!prop) return await sock.sendMessage(jid,{text:'❌ Invalid id'})
if(getBal(jid)<prop.price) return await sock.sendMessage(jid,{text:`❌ Need $${prop.price}, you have $${getBal(jid)}`})
setBal(jid,getBal(jid)-prop.price)
let list=getProps(jid); list.push(id); userProps.set(jid,list)
await sock.sendMessage(jid,{text:`✅ Bought ${prop.name} for $${prop.price}\n💰 $${getBal(jid)}`})
}
else if(t==='!myprop'){
let list=getProps(jid); if(list.length===0) return await sock.sendMessage(jid,{text:'🏠 No props. Use !prop'})
let txt='🏠 YOUR PROPERTIES:\n'
let income=0
list.forEach(id=>{ let p=PROPERTIES.find(x=>x.id===id); if(p){ txt+=`- ${p.name} ($${p.income}/h)\n`; income+=p.income } })
txt+=`\nTotal income: $${income}/hour\nUse !collect`
await sock.sendMessage(jid,{text:txt})
}
else if(t==='!collect'){
let last=lastCollect.get(jid)||0
let now=Date.now()
if(now-last<60*60*1000){
let left=60*60*1000-(now-last)
let m=Math.floor(left/60000)
return await sock.sendMessage(jid,{text:`⏰ Collect cooldown ${m}m left`})
}
let list=getProps(jid); if(list.length===0) return await sock.sendMessage(jid,{text:'No props'})
let income=0; list.forEach(id=>{ let p=PROPERTIES.find(x=>x.id===id); if(p) income+=p.income })
if(income===0) return await sock.sendMessage(jid,{text:'No income'})
lastCollect.set(jid,now)
setBal(jid,getBal(jid)+income)
await sock.sendMessage(jid,{text:`💵 Collected $${income}\n💰 $${getBal(jid)}`})
}

}catch(e){ console.log(e) }
})
}
start()
