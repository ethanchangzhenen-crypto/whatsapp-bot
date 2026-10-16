const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys')
const express = require('express')
const app = express()

let status = 'Waiting for phone number... Set PHONE env var!'
let codeText = ''

app.get('/', (req,res)=>{
  res.send(`<div style="text-align:center;font-family:Arial;padding:30px"><h1>EMPIRE BOT</h1><h2>${status}</h2><h1 style="font-size:60px;letter-spacing:10px">${codeText}</h1><p>Go WhatsApp > Linked Devices > Link with phone number > Enter this code</p><script>setTimeout(()=>location.reload(),5000)</script></div>`)
})
app.listen(process.env.PORT||3000)

async function startBot(){
  const { version } = await fetchLatestBaileysVersion()
  const { state, saveCreds } = await useMultiFileAuthState('auth_info')
  const sock = makeWASocket({ version, auth: state, browser:["Ubuntu","Chrome","20.0.04"], printQRInTerminal:false })
  sock.ev.on('creds.update', saveCreds)

  if(!sock.authState.creds.registered){
    const phone = process.env.PHONE // Set in Railway Variables
    if(phone){
      status = 'Generating code for '+phone
      setTimeout(async()=>{
        try{
          const code = await sock.requestPairingCode(phone)
          codeText = code
          status = 'ENTER THIS CODE IN WHATSAPP'
          console.log('Pairing code:', code)
        }catch(e){ status = 'Error: '+e.message }
      },3000)
    } else {
      status = 'Add PHONE variable in Railway! Example: 6281234567890 (no +)'
    }
  } else {
    status = 'BOT READY! Now send hi'
  }

  sock.ev.on('connection.update', async(u)=>{
    if(u.connection==='open'){ status='BOT READY - SEND HI NOW!'; codeText=''; }
    if(u.connection==='close' && u.lastDisconnect?.error?.output?.statusCode!==DisconnectReason.loggedOut) setTimeout(startBot,5000)
  })
  sock.ev.on('messages.upsert', async({messages})=>{
    const m=messages[0]; if(!m.message) return
    const text=(m.message.conversation||m.message.extendedTextMessage?.text||'').toLowerCase()
    console.log('Msg:', text)
    if(text==='hi'||text==='!help'){
      await sock.sendMessage(m.key.remoteJid, {text:'YES I WORK! Now I give you full empire code!'})
    }
  })
}
startBot()
