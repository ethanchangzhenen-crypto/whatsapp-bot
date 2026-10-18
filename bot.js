const { default: makeWASocket, useMultiFileAuthState } = require('@whiskeysockets/baileys')
const P = require('pino')
const express = require('express')
const QR = require('qrcode')
const app = express()
let qrData=''
app.get('/',(req,res)=>{ if(!qrData) return res.send('OK'); res.send(`<img src="${qrData}">`) })
app.listen(process.env.PORT||3000)

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
const raw=msg.message.conversation||msg.message.extendedTextMessage?.text||''
if(!raw) return
console.log('GOT',raw)
const t=raw.toLowerCase().trim()
const a=raw.trim().split(/\s+/)
if(t==='!check') await sock.sendMessage(jid,{text:'✅ Bot Online'})
else if(t==='!bal') await sock.sendMessage(jid,{text:`💰 $${getBal(jid)}`})
else if(t==='!menu') await sock.sendMessage(jid,{text:`!bal\n!daily\n!slots [amount]\n!cf [amount] heads\n!dice [amount] 3\n!prop`})
else if(t==='!daily'){ setBal(jid,getBal(jid)+500); await sock.sendMessage(jid,{text:`+$500 = $${getBal(jid)}`}) }
else if(t.startsWith('!slots')){
let bet=parseInt(a[1])||100; if(getBal(jid)<bet) return await sock.sendMessage(jid,{text:'No money'})
let p=['🍒','🍋','🔔','💎','7️⃣']; let r=[p[Math.floor(Math.random()*5)],p[Math.floor(Math.random()*5)]]
let win=r[0]===r[1]&&r[1]===r[2]&&r[2]===r[3]
if(win){ setBal(jid,getBal(jid)+bet*10); await sock.sendMessage(jid,{text:`🎰 ${r.join(' ')} 🎰\nWON +$${bet*10}\n💰 $${getBal(jid)}`}) }
else{ setBal(jid,getBal(jid)-bet); await sock.sendMessage(jid,{text:`🎰 ${r.join(' ')} 🎰\nLOST -$${bet}\n💰 $${getBal(jid)}`}) }
}
else if(t.startsWith('!cf')){
let bet=parseInt(a[1])||50; let flip=Math.random()<0.5?'heads':'tails'
if(flip===a[2]){ setBal(jid,getBal(jid)+bet); await sock.sendMessage(jid,{text:`🪙 ${flip} WIN +$${bet} $${getBal(jid)}`}) }
else{ setBal(jid,getBal(jid)-bet); await sock.sendMessage(jid,{text:`🪙 ${flip} LOSE -$${bet} $${getBal(jid)}`}) }
}
else if(t.startsWith('!dice')){
let bet=parseInt(a[1])||50; let roll=Math.floor(Math.random()*6)+1; let guess=parseInt(a[2])||3
if(roll===guess){ setBal(jid,getBal(jid)+bet*5); await sock.sendMessage(jid,{text:`🎲 ${roll} WIN +$${bet*5} $${getBal(jid)}`}) }
else{ setBal(jid,getBal(jid)-bet); await sock.sendMessage(jid,{text:`🎲 ${roll} LOSE -$${bet} $${getBal(jid)}`}) }
}
}catch(e){ console.log(e) }
})
}
start()
