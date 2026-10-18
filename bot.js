const { default: makeWASocket, useMultiFileAuthState } = require('@whiskeysockets/baileys')
const P = require('pino')
const express = require('express')
const QR = require('qrcode')
const app = express()
let qrData=''
app.get('/', (req,res)=>{ if(!qrData) return res.send('BOT CONNECTED ✅ Spam fixed'); res.send(`<center><img src="${qrData}"><br><button onclick="location.reload()">New QR</button></center>`) })
app.listen(process.env.PORT||3000)

const balances = new Map()
const getBal = (id) => { if(!balances.has(id)) balances.set(id, 1000); return balances.get(id) }
const setBal = (id, amt) => balances.set(id, amt)

async function start(){
  const { state, saveCreds } = await useMultiFileAuthState('/tmp/auth')
  const sock = makeWASocket({ auth: state, logger: P({level:'silent'}) })
  sock.ev.on('creds.update', saveCreds)
  sock.ev.on('connection.update', async u=>{
    if(u.qr){ qrData=await QR.toDataURL(u.qr); console.log('QR READY') }
    if(u.connection==='open'){ qrData=''; console.log('CONNECTED') }
    if(u.connection==='close') setTimeout(start,5000)
  })
  sock.ev.on('messages.upsert', async m=>{
    const msg=m.messages[0]
    if(!msg.message) return
    // ANTI-SPAM FIX - Ignore bot's own messages
    if(msg.key.fromMe) return
    
    const text=msg.message.conversation||msg.message.extendedTextMessage?.text||''
    if(!text) return
    const jid=msg.key.remoteJid
    console.log('Got:', text)
    
    let t=text.trim().toLowerCase()
    
    // Check commands - ONLY reply to !commands, not everything
    if(t==='check' || t==='!check'){
      await sock.sendMessage(jid,{text:'✅ Bot Online'})
      return
    }
    if(t==='!menu' || t==='.menu'){
      await sock.sendMessage(jid,{text:`✅ Bot Online
🎰 Commands:
!check - online status
!bal - balance
!daily - $500 free
!slots 100
!cf 100 heads
!dice 100`})
      return
    }
    if(t.startsWith('!bal')){
      await sock.sendMessage(jid,{text:`💰 Balance: $${getBal(jid)}`})
      return
    }
    if(t.startsWith('!daily')){
      setBal(jid, getBal(jid)+500)
      await sock.sendMessage(jid,{text:`✅ +$500 Daily! Balance: $${getBal(jid)}`})
      return
    }
    // Add other commands here same way...
  })
}
start()
