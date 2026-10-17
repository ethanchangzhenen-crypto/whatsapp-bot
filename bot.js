const { default: makeWASocket, useMultiFileAuthState } = require('@whiskeysockets/baileys')
const P = require('pino')
const express = require('express')
const app = express()
app.get('/', (req,res)=>res.send('DEBUG MODE'))
app.listen(process.env.PORT||3000)

async function startBot(){
  const { state, saveCreds } = await useMultiFileAuthState('auth2')
  const sock = makeWASocket({ auth: state, logger: P({level:'silent'}), browser: ['Debug','Chrome','1.0'] })
  sock.ev.on('creds.update', saveCreds)
  sock.ev.on('connection.update', (u)=>{ if(u.connection==='open') console.log('BOT OPEN AND READY TO READ') })

  sock.ev.on('messages.upsert', async (m)=>{
    const msg=m.messages[0]
    console.log('=== NEW MESSAGE ===')
    console.log('From:', msg.key.remoteJid)
    console.log('Is group?', msg.key.remoteJid.endsWith('@g.us'))
    console.log('Message object keys:', Object.keys(msg.message || {}))
    console.log('Full message:', JSON.stringify(msg.message).slice(0,500))

    let text = msg.message?.conversation || msg.message?.extendedTextMessage?.text || msg.message?.imageMessage?.caption || msg.message?.videoMessage?.caption || ""
    console.log('Extracted text:', text)

    if(!text) { console.log('NO TEXT FOUND - IGNORING'); return }
    
    const jid=msg.key.remoteJid
    // Try to reply to EVERYTHING to test
    try{
      await sock.sendMessage(jid, {text: `I see you said: ${text}`})
      console.log('Replied: I see you said: '+text)
    }catch(e){ console.log('Reply failed:', e.message) }
  })
}
startBot()
