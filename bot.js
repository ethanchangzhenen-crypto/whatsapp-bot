const { default: makeWASocket, useMultiFileAuthState } = require('@whiskeysockets/baileys')
const P = require('pino')
const express = require('express')
const QR = require('qrcode')
const app = express()
let qrData=''
app.get('/', (req,res)=>{ if(!qrData) return res.send('BOT CONNECTED - send any message'); res.send(`<img src="${qrData}">`) })
app.listen(process.env.PORT||3000)

async function start(){
  const { state, saveCreds } = await useMultiFileAuthState('auth3')
  const sock = makeWASocket({ auth: state, logger: P({level:'silent'}), browser: ['Chrome','Bot','1'] })
  sock.ev.on('creds.update', saveCreds)
  sock.ev.on('connection.update', async u=>{
    if(u.qr){ qrData=await QR.toDataURL(u.qr); console.log('QR READY') }
    if(u.connection==='open'){ qrData=''; console.log('CONNECTED') }
    if(u.connection==='close') setTimeout(start,3000)
  })
  sock.ev.on('messages.upsert', async m=>{
    const msg=m.messages[0]
    if(!msg.message) return
    const text = msg.message.conversation || msg.message.extendedTextMessage?.text || ''
    if(!text) return
    const jid=msg.key.remoteJid
    console.log('GOT:', text, 'FROM:', jid)
    // REPLY TO EVERYTHING - NO FILTER
    await sock.sendMessage(jid, {text: `✅ Bot Online - you said: ${text}`})
  })
}
start()
