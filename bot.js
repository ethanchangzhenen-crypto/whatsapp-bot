const { default: makeWASocket, useMultiFileAuthState } = require('@whiskeysockets/baileys')
const P = require('pino')
const express = require('express')
const QR = require('qrcode')
const app = express()
let qrData=''
app.get('/', (req,res)=>{
  if(!qrData) return res.send('BOT CONNECTED ✅')
  res.send(`<center><img src="${qrData}" width="300"><br><button onclick="location.reload()">New QR</button></center>`)
})
app.listen(process.env.PORT||3000)

const balances = new Map()
const getBal = (id) => { if(!balances.has(id)) balances.set(id, 1000); return balances.get(id) }
const setBal = (id, amt) => balances.set(id, amt)

async function start(){
  const { state, saveCreds } = await useMultiFileAuthState('auth')
  const sock = makeWASocket({ auth: state, logger: P({level:'silent'}) })
  sock.ev.on('creds.update', saveCreds)
  sock.ev.on('connection.update', async u=>{
    if(u.qr){ qrData=await QR.toDataURL(u.qr); console.log('QR READY') }
    if(u.connection==='open'){ qrData=''; console.log('CONNECTED ✅') }
    if(u.connection==='close'){ console.log('Closed'); setTimeout(start,5000) }
  })
  sock.ev.on('messages.upsert', async m=>{
    try{
      const msg=m.messages[0]
      if(!msg.message) return
      if(msg.key.fromMe) return
      const jid=msg.key.remoteJid
      const raw = msg.message.conversation || msg.message.extendedTextMessage?.text || ''
      if(!raw) return
      console.log('GOT:', raw)
      const text=raw.trim().toLowerCase()
      const args=raw.trim().split(/\s+/)
      
      if(text==='!check' || text==='check'){
        await sock.sendMessage(jid,{text:'✅ Bot Online'})
      } else if(text.startsWith('!bal') || text==='!balance'){
        await sock.sendMessage(jid,{text:`💰 Balance: $${getBal(jid)}`})
      } else if(text==='!menu' || text==='.menu'){
        await sock.sendMessage(jid,{text:`🎰 KAI CASINO
!bal - balance
!daily - $500 free
!slots 100 - slots
!cf 100 heads - coinflip
!dice 100 3 - dice`})
      } else if(text.startsWith('!daily')){
        setBal(jid, getBal(jid)+500)
        await sock.sendMessage(jid,{text:`🎁 +$500! New: $${getBal(jid)}`})
      } else if(text.startsWith('!slots')){
        let bet=parseInt(args[1])||100
        if(getBal(jid)<bet) return await sock.sendMessage(jid,{text:`❌ Need $${bet}`})
        let s=['🍒','🍋','🔔','💎','7️⃣']
        let r=[s[Math.floor(Math.random()*5)],s[Math.floor(Math.random()*5)]]
        if(r[0]===r[1] && r[1]===r[2]){ setBal(jid,getBal(jid)+bet*3); await sock.sendMessage(jid,{text:`${r.join('|')}\n🎉 WIN +$${bet*3} 💰 $${getBal(jid)}`}) }
        else{ setBal(jid,getBal(jid)-bet); await sock.sendMessage(jid,{text:`${r.join('|')}\n💀 LOSE -$${bet} 💰 $${getBal(jid)}`}) }
      } else if(text.startsWith('!cf')){
        let bet=parseInt(args[1])||50
        let choice=(args[2]||'heads').toLowerCase()
        if(getBal(jid)<bet) return await sock.sendMessage(jid,{text:`❌ Low balance`})
        let flip=Math.random()<0.5?'heads':'tails'
        if(choice===flip){ setBal(jid,getBal(jid)+bet); await sock.sendMessage(jid,{text:`🪙 ${flip} - WIN $${bet} 💰 $${getBal(jid)}`}) }
        else{ setBal(jid,getBal(jid)-bet); await sock.sendMessage(jid,{text:`🪙 ${flip} - LOSE $${bet} 💰 $${getBal(jid)}`}) }
      } else if(text.startsWith('!dice')){
        let bet=parseInt(args[1])||50
        let guess=parseInt(args[2])||3
        if(getBal(jid)<bet) return await sock.sendMessage(jid,{text:`❌ Low balance`})
        let roll=Math.floor(Math.random()*6)+1
        if(guess===roll){ setBal(jid,getBal(jid)+bet*5); await sock.sendMessage(jid,{text:`🎲 Rolled ${roll}! JACKPOT +$${bet*5} 💰 $${getBal(jid)}`}) }
        else{ setBal(jid,getBal(jid)-bet); await sock.sendMessage(jid,{text:`🎲 Rolled ${roll} (you said ${guess}) - LOSE $${bet} 💰 $${getBal(jid)}`}) }
      }
    }catch(e){ console.log('Error:', e) }
  })
}
start()
