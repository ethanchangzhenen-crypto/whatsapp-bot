const { default: makeWASocket, useMultiFileAuthState } = require('@whiskeysockets/baileys')
const P = require('pino')
const express = require('express')
const app = express()
let latestQR=''
app.get('/', (req,res)=>{
  if(!latestQR) return res.send('BOT ONLINE - NO QR NEEDED')
  res.send(`<h1>SCAN THIS NEW QR - Last time!</h1><img src="${latestQR}" style="width:350px"><p>Expires 20 sec</p><script>setTimeout(()=>location.reload(),20000),20000</script>`)
})
app.listen(process.env.PORT||3000)

async function startBot(){
  // CHANGED TO auth2 TO FIX BAD MAC
  const { state, saveCreds } = await useMultiFileAuthState('auth2')
  const sock = makeWASocket({ auth: state, logger: P({level:'silent'}), browser: ['Gambling Bot','Chrome','1.0'] })
  sock.ev.on('creds.update', saveCreds)
  sock.ev.on('connection.update', async (u)=>{
    const {connection, qr} = u
    if(qr){ latestQR = await require('qrcode').toDataURL(qr); console.log('NEW QR READY') }
    if(connection==='open'){ latestQR=''; console.log('READY - BAD MAC FIXED') }
    if(connection==='close') startBot()
  })
  sock.ev.on('messages.upsert', async (m)=>{
    try{
      const msg=m.messages[0]; if(!msg.message || msg.key.fromMe) return
      let text=msg.message.conversation || msg.message.extendedTextMessage?.text || ""
      if(!text.startsWith('.')) return
      const jid=msg.key.remoteJid
      const cmd=text.slice(1).split(' ')[0].toLowerCase()
      if(cmd==='ping') await sock.sendMessage(jid, {text:'Pong! Bad MAC fixed ✅ Now paste gambling code again'})
      if(cmd==='menu') await sock.sendMessage(jid, {text:'Bot fixed! Now paste your full gambling bot code again, but keep auth2'})
    }catch(e){}
  })
}
startBot()
