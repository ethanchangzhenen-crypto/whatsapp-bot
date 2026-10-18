const { default: makeWASocket, useMultiFileAuthState } = require('@whiskeysockets/baileys')
const P = require('pino')
const express = require('express')
const QR = require('qrcode')
const app = express()
let qrData=''
app.get('/',(req,res)=>{ if(!qrData) return res.send('OK'); res.send(`<img src="${qrData}">`) })
app.listen(process.env.PORT||3000)

const ADMIN_NUMBERS = ['7014319182055', '7014319182055@lid', '6597306863']
const isAdmin = (jid) => {
 if(!jid) return false
 return ADMIN_NUMBERS.some(n => jid.includes(n))
}

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

if(t==='!myid'){
await sock.sendMessage(jid,{text:`Your sender: ${sender}\nJID: ${jid}\nIsAdmin: ${admin}`})
return
}
if(t==='!id' || t==='!getid'){
let name = ctx?.mentionedJid?.[0] ? 'Tagged person' : ctx?.participant ? 'Replied person' : 'You'
await sock.sendMessage(jid,{text:`${name} ID: ${target}`})
return
}
if(t==='!off'){
if(!admin) return
botPaused=true
await sock.sendMessage(jid,{text:'🔴 Bot OFF\nType !on to turn on'})
return
}
if(t==='!on'){
if(!admin) return
botPaused=false
await sock.sendMessage(jid,{text:'🟢 Bot ON'})
return
}
if(botPaused) return

if(t==='!check') await sock.sendMessage(jid,{text:'✅ Bot Online'})
else if(t==='!bal') await sock.sendMessage(jid,{text:`💰 $${getBal(sender)} | 🏠 ${getProps(sender).length} props`})
else if(t==='!menu'){
let menu=`🎰 KAI MENU

💰 !bal
🎁 !daily (24h)
🎰 !slots [amount] (min 10k, 3 match = 5x, 3% chance)
🪙 !cf [amount] h/t (win = bet)
🎲 !dice [amount] 1-6 (min 1k, win 5x)
🏘️ !prop
🏠 !myprop
💵 !buy [id]
💰 !collect`
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
if(!admin) return
let amt=parseInt(a[1])||parseInt(a[a.length-1])
if(isNaN(amt)) return await sock.sendMessage(jid,{text:'❌ Ex: !addmoney 5000'})
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
if(isNaN(amt)) return await sock.sendMessage(jid,{text:'❌ Ex: !setmoney 50000 or reply with !setmoney 50000'})
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
if(!a[1] || isNaN(parseInt(a[1]))) return await sock.sendMessage(jid,{text:'❌ Ex: !slots 10000'})
let bet=parseInt(a[1])
if(bet<10000) return await sock.sendMessage(jid,{text:'❌ Minimum $10,000\nEx: !slots 10000'})
if(getBal(sender)<bet) return await sock.sendMessage(jid,{text:`❌ No money $${getBal(sender)}`})
let pool=['🍒','🍋','🔔','💎','7️⃣','🍇','🍀']
let s=()=>pool[Math.floor(Math.random()*pool.length)]
let r=[s(),s(),s()]
if(Math.random()<0.03){
  r=[r[0],r[0],r[0]]
} else {
  while(r[0]===r[1] && r[1]===r[2]){
    r=[s(),s(),s()]
  }
}
if(r[0]===r[1] && r[1]===r[2]){
  let win=bet*5
  setBal(sender,getBal(sender)+win)
  await sock.sendMessage(jid,{text:`🎰  ${r[0]}  ${r[1]}  ${r[2]}  🎰\n🎉 JACKPOT 3 KIND 5x +$${win}\n💰 $${getBal(sender)}`})
} else {
  setBal(sender,getBal(sender)-bet)
  await sock.sendMessage(jid,{text:`🎰  ${r[0]}  ${r[1]}  ${r[2]}  🎰\n💀 LOSE -$${bet}\n💰 $${getBal(sender)}`})
}
}
else if(t.startsWith('!cf')){
if(!a[1] || isNaN(parseInt(a[1]))) return await sock.sendMessage(jid,{text:'❌ Ex: !cf 50 heads'})
if(!a[2]) return await sock.sendMessage(jid,{text:'❌ heads/tails Ex: !cf 100 heads'})
let bet=parseInt(a[1])
if(bet<=0) return await sock.sendMessage(jid,{text:'❌ >0'})
if(getBal(sender)<bet) return await sock.sendMessage(jid,{text:`❌ $${getBal(sender)}`})
let flip=Math.random()<0.5?'heads':'tails'
let guess=a[2].startsWith('h')?'heads':'tails'
if(flip===guess){
  setBal(sender,getBal(sender)+bet)
  await sock.sendMessage(jid,{text:`🪙 ${flip.toUpperCase()}\n✅ WIN +$${bet}\n💰 $${getBal(sender)}`})
} else {
  setBal(sender,getBal(sender)-bet)
  await sock.sendMessage(jid,{text:`🪙 ${flip.toUpperCase()}\n❌ LOSE -$${bet}\n💰 $${getBal(sender)}`})
}
}
else if(t.startsWith('!dice')){
if(!a[1] || isNaN(parseInt(a[1]))) return await sock.sendMessage(jid,{text:'❌ Ex: !dice 1000 3'})
if(!a[2] || isNaN(parseInt(a[2]))) return await sock.sendMessage(jid,{text:'❌ 1-6 Ex: !dice 1000 3'})
let bet=parseInt(a[1])
let guess=parseInt(a[2])
if(bet<1000) return await sock.sendMessage(jid,{text:'❌ Minimum dice bet $1,000'})
if(guess<1||guess>6) return await sock.sendMessage(jid,{text:'❌ 1-6 only'})
if(getBal(sender)<bet) return await sock.sendMessage(jid,{text:`❌ $${getBal(sender)}`})
let roll2=Math.floor(Math.random()*6)+1
if(roll2===guess){
  let win=bet*5
  setBal(sender,getBal(sender)+win)
  await sock.sendMessage(jid,{text:`🎲 Rolled ${roll2}\n🎉 WIN +$${win} (5x)\n💰 $${getBal(sender)}`})
} else {
  setBal(sender,getBal(sender)-bet)
  await sock.sendMessage(jid,{text:`🎲 Rolled ${roll2} you picked ${guess}\n💀 LOSE -$${bet}\n💰 $${getBal(sender)}`})
}
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
