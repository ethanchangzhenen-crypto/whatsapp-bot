const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys')
const qrcode = require('qrcode')
const express = require('express')
const app = express()
let qrImage = null
let botStatus = 'Starting...'

app.get('/', (req,res)=>{
  if(qrImage) res.send(`<div style="text-align:center"><h1>SCAN QR</h1><img src="${qrImage}" style="width:300px"><script>setTimeout(()=>location.reload(),20000)</script></div>`)
  else res.send(`<h2>${botStatus}</h2><script>setTimeout(()=>location.reload(),5000)</script>`)
})
app.listen(process.env.PORT||3000)

async function startBot(){
  const { version } = await fetchLatestBaileysVersion()
  const { state, saveCreds } = await useMultiFileAuthState('auth_info')
  const sock = makeWASocket({ version, auth: state, printQRInTerminal:false })
  sock.ev.on('creds.update', saveCreds)
  sock.ev.on('connection.update', async(u)=>{
    if(u.qr) qrImage = await qrcode.toDataURL(u.qr)
    if(u.connection==='open'){ qrImage=null; botStatus='BOT READY - SEND HI NOW'; console.log('READY')}
    if(u.connection==='close' && u.lastDisconnect?.error?.output?.statusCode!==DisconnectReason.loggedOut) setTimeout(startBot,5000)
  })
  sock.ev.on('messages.upsert', async({messages})=>{
    const m=messages[0]
    if(!m.message) return
    const text=(m.message.conversation||m.message.extendedTextMessage?.text||'').trim().toLowerCase()
    const jid=m.key.remoteJid
    console.log('Got message:', text, 'from:', jid, 'fromMe:', m.key.fromMe)
    if(text==='hi' || text==='!help' || text==='!balance'){
      await sock.sendMessage(jid, {text: `YES I WORK! You said: ${text}\nMy owner can play now! ✅`})
    }
  })
}
startBot()
