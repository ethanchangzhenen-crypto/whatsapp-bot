const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, Browsers } = require('@whiskeysockets/baileys')
const P = require('pino')
const express = require('express')
const app = express()
app.get('/', (req,res)=>res.send('TEST BOT ONLINE'))
app.listen(process.env.PORT||3000)
async function startBot(){
    const { state, saveCreds } = await useMultiFileAuthState('auth')
    const sock = makeWASocket({ auth: state, logger: P({level:'silent'}), browser: Browsers.ubuntu('Chrome') })
    sock.ev.on('creds.update', saveCreds)
    sock.ev.on('connection.update', (u)=>{ if(u.connection==='open') console.log('READY') })
    sock.ev.on('messages.upsert', async (m)=>{
        const msg=m.messages[0]; if(!msg.message) return
        console.log('GOT MESSAGE:', msg.message)
        await sock.sendMessage(msg.key.remoteJid, {text:'I RECEIVED: '+JSON.stringify(Object.keys(msg.message))})
    })
}
startBot()
