const { default: makeWASocket, useMultiFileAuthState } = require('@whiskeysockets/baileys')
const P = require('pino')
const express = require('express')
const QRCode = require('qrcode')

const app = express()
let qrCode = null
let connected = false

app.get('/', async (req,res)=>{
  if(connected) return res.send('<h1>✅ LINKED! Now send !menu to bot on WhatsApp</h1><p>If bot not replying, check Railway logs for "RECEIVED:"</p>')
  if(qrCode){
    let img = await QRCode.toDataURL(qrCode)
    return res.send(`<center><h1>SCAN THIS</h1><img src="${img}" style="width:350px"><br><p>WhatsApp > Linked Devices > Link Device</p><script>setTimeout(()=>location.reload(),20000)</script></center>`)
  }
  res.send('Starting... reload in 3s<script>setTimeout(()=>location.reload(),2000)</script>')
})
app.listen(process.env.PORT||3000)

async function start(){
  const { state, saveCreds } = await useMultiFileAuthState('./auth')
  const sock = makeWASocket({ auth: state, logger: P({level:'silent'}) })
  sock.ev.on('creds.update', saveCreds)
  
  sock.ev.on('connection.update', ({connection, qr})=>{
    if(qr){ qrCode=qr; console.log('NEW QR - CHECK DOMAIN') }
    if(connection==='open'){ connected=true; qrCode=null; console.log('✅ CONNECTED - BOT READY TO RECEIVE') }
    if(connection==='close'){ connected=false; console.log('Closed - restarting'); setTimeout(start,2000) }
  })

  sock.ev.on('messages.upsert', async ({messages, type})=>{
    const msg = messages[0]
    if(!msg) return
    console.log('RAW MESSAGE RECEIVED:', JSON.stringify(msg.message).slice(0,200))
    if(msg.key.fromMe) return console.log('Skipped - fromMe')
    let text = msg.message?.conversation || msg.message?.extendedTextMessage?.text || msg.message?.imageMessage?.caption || ''
    console.log('RECEIVED TEXT:', text, 'FROM:', msg.key.remoteJid)
    if(!text) return
    
    // ECHO EVERYTHING - NO ! NEEDED
    await sock.sendMessage(msg.key.remoteJid, {text: `Got your message: ${text}\nIf you see this, bot WORKS! Now try !menu`})
    
    if(text.toLowerCase().includes('!menu') || text.toLowerCase().includes('menu')){
      await sock.sendMessage(msg.key.remoteJid, {text: '💰 MENU WORKING!\n!balance\n!farm\n!hunt\n!fish\nBalance $1000'})
    }
  })
}
start()
