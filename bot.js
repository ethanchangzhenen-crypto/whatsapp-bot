const { default: makeWASocket, useMultiFileAuthState } = require('@whiskeysockets/baileys')
const P = require('pino')
const express = require('express')
const QR = require('qrcode')
const app = express()
let qrData=''
app.get('/', (req,res)=>{
  if(!qrData) return res.send('BOT CONNECTED ✅ Gambling Ready')
  res.send(`<center><img src="${qrData}" width="300"><br><button onclick="location.reload()">New QR</button></center>`)
})
app.listen(process.env.PORT||3000)

const balances = new Map()
const getBal = (id) => { if(!balances.has(id)) balances.set(id, 1000); return balances.get(id) }
const setBal = (id, amt) => balances.set(id, amt)

async function start(){
  const { state, saveCreds } = await useMultiFileAuthState('/tmp/auth_final')
  const sock = makeWASocket({ auth: state, logger: P({level:'silent'}) })
  sock.ev.on('creds.update', saveCreds)
  sock.ev.on('connection.update', async u=>{
    if(u.qr){ qrData=await QR.toDataURL(u.qr) }
    if(u.connection==='open'){ qrData=''; console.log('CONNECTED ✅') }
    if(u.connection==='close') setTimeout(start,5000)
  })
  sock.ev.on('messages.upsert', async m=>{
    const msg=m.messages[0]
    if(!msg.message) return
    if(msg.key.fromMe) return
    const jid=msg.key.remoteJid
    const text = msg.message.conversation || msg.message.extendedTextMessage?.text || ''
    if(!text) return
    console.log('Got:', text)
    const t=text.trim().toLowerCase()
    const args=text.trim().split(/\s+/)
    
    if(t==='!check' || t==='check'){
      await sock.sendMessage(jid,{text:'✅ Bot Online'})
    }
    else if(t==='!menu' || t==='.menu'){
      await sock.sendMessage(jid,{text:`🎰 *KAI CASINO* 🎰
💰 !bal - balance
🎁 !daily - free $500 (1x)
🎰 !slots <amount>
🪙 !cf <amount> heads/tails
🎲 !dice <amount> 1-6
📜 !menu`})
    }
    else if(t.startsWith('!bal') || t==='.bal'){
      await sock.sendMessage(jid,{text:`💰 Balance: $${getBal(jid)}`})
    }
    else if(t.startsWith('!daily')){
      setBal(jid, getBal(jid)+500)
      await sock.sendMessage(jid,{text:`🎁 +$500! New Balance: $${getBal(jid)}`})
    }
    else if(t.startsWith('!slots')){
      let bet=parseInt(args[1])||100
      if(getBal(jid)<bet) return sock.sendMessage(jid,{text:`❌ Need $${bet}, you have $${getBal(jid)}`})
      let slots=['🍒','🍋','🔔','💎','7️⃣']
      let r=[slots[Math.floor(Math.random()*5)],slots[Math.floor(Math.random()*5)],slots[Math.floor(Math.random()*5)]]
      let win=r[0]===r[1] && r[1]===r[2]
      if(win){ setBal(jid, getBal(jid)+bet*3); await sock.sendMessage(jid,{text:`${r.join('|')}\n🎉 JACKPOT! +$${bet*3}\n💰 $${getBal(jid)}`}) }
      else{ setBal(jid, getBal(jid)-bet); await sock.sendMessage(jid,{text:`${r.join('|')}\n💀 Lost $${bet}\n💰 $${getBal(jid)}`}) }
    }
    else if(t.startsWith('!cf')){
      let bet=parseInt(args[1])||50
      let choice=(args[2]||'heads').toLowerCase()
      if(getBal(jid)<bet) return sock.sendMessage(jid,{text:`❌ Low balance`})
      let flip=Math.random()<0.5?'heads':'tails'
      if(choice===flip){ setBal(jid, getBal(jid)+bet); await sock.sendMessage(jid,{text:`🪙 ${flip} - You WIN $${bet}! 💰 $${getBal(jid)}`}) }
      else{ setBal(jid, getBal(jid)-bet); await sock.sendMessage(jid,{text:`🪙 ${flip} - You LOSE $${bet} 💰 $${getBal(jid)}`}) }
    }
    else if(t.startsWith('!dice')){
      let bet=parseInt(args[1])||50
      let guess=parseInt(args[2])||3
      if(getBal(jid)<bet) return sock.sendMessage(jid,{text:`❌ Low balance`})
      let roll=Math.floor(Math.random()*6)+1
      if(guess===roll){ setBal(jid, getBal(jid)+bet*5); await sock.sendMessage(jid,{text:`🎲 Rolled ${roll}! JACKPOT +$${bet*5} 💰 $${getBal(jid)}`}) }
      else{ setBal(jid, getBal(jid)-bet); await sock.sendMessage(jid,{text:`🎲 Rolled ${roll} (you said ${guess}) - Lost $${bet} 💰 $${getBal(jid)}`}) }
    }
  })
}
start()
