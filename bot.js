const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys')
const qrcode = require('qrcode')
const express = require('express')
const app = express()

let qrImage = null
let botStatus = 'Starting bot... please wait 20 sec and refresh'

app.get('/', (req, res) => {
  if (qrImage) {
    res.send(`
      <div style="text-align:center; font-family:Arial; padding:20px">
        <h1>Scan This QR</h1>
        <p>Open WhatsApp > Linked Devices > Link a Device</p>
        <img src="${qrImage}" style="width:320px; border:10px solid black">
        <br><br>
        <p>This QR changes every 30 sec. Refresh page if expired.</p>
        <script>setTimeout(()=>location.reload(),15000)</script>
      </div>
    `)
  } else {
    res.send(`
      <div style="text-align:center; font-family:Arial; padding:20px">
        <h1>${botStatus}</h1>
        <p>Please wait 20 sec and refresh page</p>
        <script>setTimeout(()=>location.reload(),5000)</script>
      </div>
    `)
  }
})

app.listen(process.env.PORT || 3000, () => console.log('Website running'))

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState('auth_info')
  const sock = makeWASocket({ auth: state, printQRInTerminal: false })
  sock.ev.on('creds.update', saveCreds)

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update
    if (qr) {
      qrImage = await qrcode.toDataURL(qr)
      botStatus = 'QR READY - Scan now'
      console.log('QR ready')
    }
    if (connection === 'open') {
      qrImage = null
      botStatus = 'BOT READY 24/7 - Connected! You can close this page'
      console.log('BOT READY 24/7')
    }
    if (connection === 'close') {
      const shouldReconnect = lastDisconnect?.error?.output?.statusCode!== DisconnectReason.loggedOut
      if (shouldReconnect) startBot()
      else {
        botStatus = 'Logged out - delete auth and restart'
      }
    }
  })

  sock.ev.on('messages.upsert', async ({ messages }) => {
    const msg = messages[0]
    if (!msg.message || msg.key.fromMe) return
    const text = msg.message.conversation || msg.message.extendedTextMessage?.text || msg.message.imageMessage?.caption || ''
    const jid = msg.key.remoteJid
    if (!jid) return

    if (text.toLowerCase().includes('hi') || text.toLowerCase().includes('hello')) {
      await sock.sendMessage(jid, { text: 'Hello! I am Online 24/7 🤖 Bot is working!' })
    }
    if (text.toLowerCase() === 'test') {
      await sock.sendMessage(jid, { text: 'Test OK! Bot is alive 24/7 ✅' })
    }
  })
}

startBot()
