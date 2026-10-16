const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, DisconnectReason } = require('@whiskeysockets/baileys')
const express = require('express')
const app = express()
let page = '<h1>Starting... refresh in 10 sec</h1>'

app.get('/', (req,res)=> res.send(page))
app.listen(process.env.PORT||3000)

async function start(){
  const {version} = await fetchLatestBaileysVersion()
  const {state, saveCreds} = await useMultiFileAuthState('./auth_info')
  const sock = makeWASocket({version, auth: state, browser: ["Ubuntu","Chrome","110"], printQRInTerminal:false})
  sock.ev.on('creds.update', saveCreds)

  sock.ev.on('connection.update', async (u)=>{
    console.log(u)
    if(u.qr){
      const QRCode = require('qrcode')
      const qrImg = await QRCode.toDataURL(u.qr)
      page = `
      <div style="text-align:center;font-family:Arial;padding:20px">
        <h1 style="color:#25D366">SCAN THIS QR - DO NOT USE CODE</h1>
        <img src="${qrImg}" style="width:330px;border:8px solid #25D366;border-radius:20px">
        <h3>1. Open WhatsApp > Settings > Linked Devices</h3>
        <h3>2. Click Link a Device > Scan</h3>
        <h3>3. Scan this QR within 20 sec</h3>
        <p>Auto refreshes every 20 sec for new QR</p>
        <script>setTimeout(()=>location.reload(),20000)</script>
      </div>`
    }
    if(u.connection==='open'){
      page = '<h1 style="text-align:center;padding:50px;color:green">✅ LINKED! Send hi to bot now!</h1>'
      console.log('LINKED SUCCESS')
    }
    if(u.connection==='close'){
      const code = u.lastDisconnect?.error?.output?.statusCode
      if(code!== DisconnectReason.loggedOut) setTimeout(start, 2000)
      else { page = '<h1>Logged out - delete auth_info and try again</h1>' }
    }
  })

  sock.ev.on('messages.upsert', async ({messages})=>{
    const m=messages[0]; if(!m.message) return
    const t=(m.message.conversation||m.message.extendedTextMessage?.text||'').toLowerCase()
    if(t==='hi') await sock.sendMessage(m.key.remoteJid, {text:'✅ QR METHOD WORKS! Empire Bot Online! Type!help'})
  })
}
start()
