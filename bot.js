const { default: makeWASocket, useMultiFileAuthState } = require('@whiskeysockets/baileys')
const P = require('pino')
const express = require('express')
const QR = require('qrcode')
const app = express()
let qrData=''
app.get('/', (req,res)=>{
  if(!qrData) return res.send('BOT CONNECTED ✅')
  res.send(`<center><h1>Scan QR</h1><img src="${qrData}" width="300"><br><button onclick="location.reload()">New QR</button></center>`)
})
app.listen(process.env.PORT||3000)

async function start(){
  const { state, saveCreds } = await useMultiFileAuthState('/tmp/auth_final')
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
      if(msg.key.fromMe) return // ignore self
      const jid=msg.key.remoteJid
      const text = msg.message.conversation || msg.message.extendedTextMessage?.text || msg.message.imageMessage?.caption || ''
      console.log('RECEIVED:', text, 'from', jid)
      const t=text.trim().toLowerCase()
      if(t==='!check' || t==='check' || t==='.check'){
        console.log('REPLYING check')
        await sock.sendMessage(jid, {text:'✅ Bot Online'})
      }
    }catch(e){ console.log('Error:', e) }
  })
}
start()
