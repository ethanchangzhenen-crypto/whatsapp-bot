const { default: makeWASocket, useMultiFileAuthState } = require('@whiskeysockets/baileys')
const P = require('pino')
const express = require('express')
const QR = require('qrcode')
const app = express()
let qrData=''
app.get('/', (req,res)=>{ if(!qrData) return res.send('BOT CONNECTED - Send !bal'); res.send(`<img src="${qrData}">`) })
app.listen(process.env.PORT||3000)

async function start(){
  const { state, saveCreds } = await useMultiFileAuthState('auth3')
  const sock = makeWASocket({ auth: state, logger: P({level:'silent'}), browser: ['Chrome','Bot','1'] })
  sock.ev.on('creds.update', saveCreds)
  sock.ev.on('connection.update', async u=>{
    if(u.qr) qrData=await QR.toDataURL(u.qr)
    if(u.connection==='open'){ qrData=''; console.log('CONNECTED') }
    if(u.connection==='close') setTimeout(start,3000)
  })
  sock.ev.on('messages.upsert', async m=>{
    try{
      const msg=m.messages[0]
      if(!msg.message) return
      const text = msg.message.conversation || msg.message.extendedTextMessage?.text || msg.message.imageMessage?.caption || ''
      if(!text) return
      console.log('RECEIVED:', text, 'fromMe:', msg.key.fromMe, 'jid:', msg.key.remoteJid)
      
      const jid=msg.key.remoteJid
      
      // ALWAYS REPLY - No filter
      await sock.sendMessage(jid, {text: `I GOT YOUR MESSAGE: ${text} - Now trying command...`})
      
      // Then try commands
      let t=text.trim()
      if(t.startsWith('!') || t.startsWith('.')) t=t.slice(1)
      t=t.toLowerCase()
      
      if(t.startsWith('bal')){
        await sock.sendMessage(jid, {text: `💰 BALANCE TEST OK - $1000`})
      }
      if(t.startsWith('menu')){
        await sock.sendMessage(jid, {text: `MENU OK - Commands: !bal !slots !daily`})
      }
    }catch(e){ console.log('ERROR:', e) }
  })
}
start()
