const { default: makeWASocket, useMultiFileAuthState } = require('@whiskeysockets/baileys')
const P = require('pino')
const express = require('express')
const QR = require('qrcode')
const app = express()
let qrData=''
app.get('/',(req,res)=>{ if(!qrData) return res.send('OK'); res.send(`<img src="${qrData}">`) })
app.listen(process.env.PORT||3000)

const ADMIN_NUMBERS = ['65'] // CHANGE TO YOUR NUMBER ex: 6591234567
const isAdmin = (jid) => ADMIN_NUMBERS.some(n => jid.includes(n))

const balances=new Map()
const getBal=id=>{ if(!balances.has(id)) balances.set(id,1000); return balances.get(id) }
const setBal=(id,amt)=>balances.set(id,amt)

async function start(){
const {state,saveCreds}=await useMultiFileAuthState('auth')
const sock=makeWASocket({auth:state,logger:P({level:'silent'})})
sock.ev.on('creds.update',saveCreds)
sock.ev.on('connection.update',async u=>{
if(u.qr){qrData=await QR.toDataURL(u.qr); console.log('QR READY')}
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
else if(t==='!bal') await sock.sendMessage(jid,{text:`💰 $${getBal(jid)}`})
else if(t==='!menu'){
let menu=`🎰 KAI MENU

💰 !bal
🎁 !daily - free $500
🎰 !slots [amount] - slots
🪙 !cf [amount] [heads/tails] - coinflip
🎲 !dice [amount] [1-6] - dice

Slots Rates:
🎰 JACKPOT 100x = 1%
🎰 TRIPLE 20x = 5%
🎰 DOUBLE 2x = 30%
💀 LOSE = 64%`
if(admin) menu+=`\n\n👑 ADMIN:\n!addmoney [amount]\n!removemoney [amount]\n!setmoney [amount]\n!reset\n!resetall\n(reply to user)`
await sock.sendMessage(jid,{text:menu})
}
else if(t==='!daily'){ setBal(jid,getBal(jid)+500); await sock.sendMessage(jid,{text:`🎁 +$500 = $${getBal(jid)}`}) }

// ADMIN
else if(t.startsWith('!addmoney')){
if(!admin) return await sock.sendMessage(jid,{text:'Admin only'})
let amt=parseInt(a[a.length-1]); if(isNaN(amt)) return await sock.sendMessage(jid,{text:'❌ Insert amount\nEx: !addmoney 5000'})
setBal(target,getBal(target)+amt); await sock.sendMessage(jid,{text:`👑 +$${amt} -> $${getBal(target)}`})
}
else if(t.startsWith('!removemoney')){
if(!admin) return await sock.sendMessage(jid,{text:'Admin only'})
let amt=parseInt(a[a.length-1]); if(isNaN(amt)) return await sock.sendMessage(jid,{text:'❌ Insert amount\nEx: !removemoney 500'})
setBal(target,Math.max(0,getBal(target)-amt)); await sock.sendMessage(jid,{text:`👑 -$${amt} -> $${getBal(target)}`})
}
else if(t.startsWith('!setmoney')){
if(!admin) return await sock.sendMessage(jid,{text:'Admin only'})
let amt=parseInt(a[a.length-1]); if(isNaN(amt)) return await sock.sendMessage(jid,{text:'❌ Insert amount\nEx: !setmoney 1000'})
setBal(target,amt); await sock.sendMessage(jid,{text:`👑 Set $${amt}`})
}
else if(t.startsWith('!reset')){
if(!admin) return await sock.sendMessage(jid,{text:'Admin only'})
if(t==='!resetall'){ balances.clear(); return await sock.sendMessage(jid,{text:'👑 RESET ALL'}) }
setBal(target,1000); await sock.sendMessage(jid,{text:`👑 Reset to $1000`})
}

// SLOTS - NOW REQUIRES AMOUNT
else if(t.startsWith('!slots')){
if(!a[1] || isNaN(parseInt(a[1]))) return await sock.sendMessage(jid,{text:'❌ Please insert amount\nEx: !slots 100'})
let bet=parseInt(a[1]); if(bet<=0) return await sock.sendMessage(jid,{text:'❌ Amount must be >0'})
if(getBal(jid)<bet) return await sock.sendMessage(jid,{text:`❌ No money. You have $${getBal(jid)}`})
let pool=['🍒','🍋','🔔','💎','7️⃣','🍇','🍀']; let s=()=>pool[Math.floor(Math.random()*pool.length)]
let r=[s(),s(),s(),s()]
let roll=Math.random()*100
if(roll<1) r=[r[0],r[0],r[0],r[0]] // 1% JACKPOT
else if(roll<6){ let e=r[0]; let o=pool.filter(x=>x!==e)[Math.floor(Math.random()*5)]; r=[e,e,e,o].sort(()=>Math.random()-0.5) } // 5% TRIPLE
else if(roll<36){ let e=r[0]; r=[e,e,s(),s()].sort(()=>Math.random()-0.5) } // 30% DOUBLE
else{ while(new Set(r).size<4) r=[s(),s(),s(),s()] } // 64% LOSE
let counts={}; r.forEach(x=>counts[x]=(counts[x]||0)+1)
let max=Math.max(...Object.values(counts))
let mult=max===4?100:max===3?20:max===2?2:0
let txt=`🎰  ${r[0]}  ${r[1]}  ${r[2]}  ${r[3]}  🎰\n`
if(mult>0){ let win=bet*mult; setBal(jid,getBal(jid)+win); txt+=`🎉 ${max===4?'JACKPOT 100x':max===3?'TRIPLE 20x':'DOUBLE 2x'} +$${win}\n💰 $${getBal(jid)}` }
else{ setBal(jid,getBal(jid)-bet); txt+=`💀 LOSE -$${bet}\n💰 $${getBal(jid)}` }
await sock.sendMessage(jid,{text:txt})
}

// COINFLIP - NOW REQUIRES AMOUNT
else if(t.startsWith('!cf')){
if(!a[1] || isNaN(parseInt(a[1]))) return await sock.sendMessage(jid,{text:'❌ Please insert amount\nEx: !cf 50 heads'})
if(!a[2] || !['heads','tails','h','t'].includes(a[2])) return await sock.sendMessage(jid,{text:'❌ Choose heads or tails\nEx: !cf 50 heads'})
let bet=parseInt(a[1]); if(getBal(jid)<bet) return await sock.sendMessage(jid,{text:`❌ No money. $${getBal(jid)}`})
let flip=Math.random()<0.5?'heads':'tails'
let guess=a[2].startsWith('h')?'heads':'tails'
if(flip===guess){ setBal(jid,getBal(jid)+bet); await sock.sendMessage(jid,{text:`🎰  🪙  ${flip.toUpperCase()}  🪙  🎰\n🎉 WIN +$${bet}\n💰 $${getBal(jid)}`}) }
else{ setBal(jid,getBal(jid)-bet); await sock.sendMessage(jid,{text:`🎰  🪙  ${flip.toUpperCase()}  🪙  🎰\n💀 LOSE -$${bet}\n💰 $${getBal(jid)}`}) }
}

// DICE - NOW REQUIRES AMOUNT
else if(t.startsWith('!dice')){
if(!a[1] || isNaN(parseInt(a[1]))) return await sock.sendMessage(jid,{text:'❌ Please insert amount\nEx: !dice 50 3'})
if(!a[2] || isNaN(parseInt(a[2]))) return await sock.sendMessage(jid,{text:'❌ Please insert number 1-6\nEx: !dice 50 3'})
let bet=parseInt(a[1]); let guess=parseInt(a[2])
if(guess<1||guess>6) return await sock.sendMessage(jid,{text:'❌ Number must be 1-6'})
if(getBal(jid)<bet) return await sock.sendMessage(jid,{text:`❌ No money. $${getBal(jid)}`})
let roll=Math.floor(Math.random()*6)+1
if(roll===guess){ setBal(jid,getBal(jid)+bet*5); await sock.sendMessage(jid,{text:`🎰  🎲  ${roll}  🎲  🎰\n🎉 WIN +$${bet*5} (5x)\n💰 $${getBal(jid)}`}) }
else{ setBal(jid,getBal(jid)-bet); await sock.sendMessage(jid,{text:`🎰  🎲  ${roll}  🎲  🎰\n💀 LOSE -$${bet} (you guessed ${guess})\n💰 $${getBal(jid)}`}) }
}

}catch(e){ console.log(e) }
})
}
start()
