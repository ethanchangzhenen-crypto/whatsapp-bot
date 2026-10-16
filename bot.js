const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys')
const express = require('express')
const fs = require('fs')
const app = express()
let currentCode = 'Generating... Wait 5 sec and refresh'
let botStatus = 'Starting...'

if(fs.existsSync('auth_info') &&!fs.readdirSync('auth_info').length){
  // clear empty
}

app.get('/', (req,res)=>{
  res.send(`<h1 style="text-align:center;font-family:sans-serif">BOT LINK PAGE<br><br>Status: ${botStatus}<br><br><div style="font-size:50px;background:#25D366;color:white;padding:20px;border-radius:15px;letter-spacing:10px">${currentCode}</div><br>WhatsApp > Linked Devices > Link with phone number > Enter code FAST (15 sec only!)<br><br><button onclick="location.reload()" style="padding:15px 30px;font-size:20px">Get New Code</button><script>setTimeout(()=>location.reload(),15000)</script></h1>`)
})
app.listen(process.env.PORT||3000, ()=>console.log('Web up'))

async function start(){
  const {version} = await fetchLatestBaileysVersion()
  console.log('Using WA version', version)
  const {state, saveCreds} = await useMultiFileAuthState('auth_info')
  const sock = makeWASocket({version, auth: state, browser:["Chrome","Chrome","1.0"], printQRInTerminal:false})
  sock.ev.on('creds.update', saveCreds)

  if(!state.creds.registered){
    botStatus = 'Not registered - generating code'
    console.log('Generating pairing code for 6597306693...')
    await new Promise(r=>setTimeout(r,5000))
    try{
      const code = await sock.requestPairingCode("6597306693")
      currentCode = code
      botStatus = 'CODE READY - ENTER NOW!'
      console.log('***** YOUR CODE IS: '+code+' *****')
    }catch(e){
      console.log('Pairing error', e)
      botStatus = 'Error: '+e.message
      currentCode = 'Retry in 10 sec - Refresh page'
    }
  } else {
    botStatus = 'Already linked! Bot ready!'
    currentCode = 'LINKED ✅'
  }

  sock.ev.on('connection.update', (u)=>{
    console.log('Connection:', u)
    if(u.connection==='open'){ botStatus='BOT READY - SEND HI NOW'; currentCode='✅ CONNECTED!'; console.log('BOT CONNECTED SUCCESS') }
  })

  sock.ev.on('messages.upsert', async ({messages})=>{
    const m=messages[0]; if(!m.message) return
    const txt = (m.message.conversation||m.message.extendedTextMessage?.text||'').toLowerCase()
    console.log('MSG:', txt)
    if(txt==='hi'){ await sock.sendMessage(m.key.remoteJid, {text:'✅ IT WORKS! Your bot is ONLINE! Now type!help'}) }
  })
}
start()
