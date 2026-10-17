const { default: makeWASocket, useMultiFileAuthState } = require('@whiskeysockets/baileys')
const P = require('pino')
const express = require('express')
const QR = require('qrcode')
const app = express()
let qrData = ''
app.get('/', async (req,res)=>{
  if(!qrData) return res.send('<h1>BOT IS CONNECTED ✅</h1><p>If commands not working, send hi to bot number.</p>')
  res.send(`<h1>SCAN THIS QR</h1><img src="${qrData}"><p>Refresh in 20s</p><script>setTimeout(()=>location.reload(),20000)</script>`)
})
app.listen(process.env.PORT||3000)

async function start(){
  const { state, saveCreds } = await useMultiFileAuthState('auth2')
  const sock = makeWASocket({ auth: state, logger: P({level:'silent'}), browser: ['Chrome','Bot','1'] })
  sock.ev.on('creds.update', saveCreds)
  sock.ev.on('connection.update', async (u)=>{
    if(u.qr){ qrData = await QR.toDataURL(u.qr); console.log('QR READY - Go to website') }
    if(u.connection==='open'){ qrData=''; console.log('✅ CONNECTED - BOT READY') }
    if(u.connection==='close'){ console.log('CLOSED, restarting'); setTimeout(start,3000) }
  })
  sock.ev.on('messages.upsert', async (m)=>{
    try{
      const msg=m.messages[0]
      if(!msg.message || msg.key.fromMe) return
      const text = msg.message.conversation || msg.message.extendedTextMessage?.text || msg.message.imageMessage?.caption || ''
      console.log('MESSAGE RECEIVED:', text)
      if(!text) return
      await sock.sendMessage(msg.key.remoteJid, {text: `✅ Working! You said: ${text}\n\nNow try .menu`})
    }catch(e){ console.log('Error:', e.message) }
  })
}
start()
