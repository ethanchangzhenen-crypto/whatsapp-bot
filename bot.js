const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys')
const qrcode = require('qrcode')
const express = require('express')
const app = express()

let qrImage = null
let botStatus = 'Starting bot... wait 15 sec then refresh'

app.get('/', (req, res) => {
  if (qrImage) {
    res.send(`
      <div style="text-align:center;font-family:Arial;padding:20px">
        <h1 style="color:green">SCAN THIS QR NOW!</h1>
        <p>WhatsApp > Linked Devices > Link a Device</p>
        <img src="${qrImage}" style="width:340px;border:15px solid black;border-radius:10px">
        <p><b>QR expires in 30 sec! Refresh if expired</b></p>
        <script>setTimeout(()=>location.reload(),20000)</script>
      </div>
    `)
  } else {
    res.send(`
      <div style="text-align:center;font-family:Arial;padding:20px">
        <h2>${botStatus}</h2>
        <p>If this stays more than 1 min, go to Railway and click RESTART</p>
        <p>Last update: ${new Date().toLocaleTimeString()}</p>
        <script>setTimeout(()=>location.reload(),8000)</script>
      </div>
    `)
  }
})

app.listen(process.env.PORT || 3000, () => console.log('Web running'))

async function startBot() {
  try {
    const { version } = await fetchLatestBaileysVersion()
    const { state, saveCreds } = await useMultiFileAuthState('auth_info')
    const sock = makeWASocket({
      version,
      auth: state,
      printQRInTerminal: false,
      browser: ["Ubuntu", "Chrome", "20.0.04"],
      syncFullHistory: false
    })

    sock.ev.on('creds.update', saveCreds)

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update
      console.log('Connection update:', update)
      if (qr) {
        console.log('QR received, generating image')
        qrImage = await qrcode.toDataURL(qr)
        botStatus = 'QR READY!'
      }
      if (connection === 'open') {
        console.log('Connected!')
        qrImage = null
        botStatus = 'BOT READY 24/7 - Connected! You can close this page'
      }
      if (connection === 'close') {
        const statusCode = lastDisconnect?.error?.output?.statusCode
        console.log('Closed, status:', statusCode)
        qrImage = null
        if (statusCode!== DisconnectReason.loggedOut) {
          botStatus = 'Disconnected, restarting in 5 sec...'
          setTimeout(startBot, 5000)
        } else {
          botStatus = 'Logged out - delete auth_info folder in GitHub and restart Railway'
        }
      }
    })

    sock.ev.on('messages.upsert', async ({ messages }) => {
      const msg = messages[0]
      if (!msg.message || msg.key.fromMe) return
      const text = (msg.message.conversation || msg.message.extendedTextMessage?.text || '').toLowerCase()
      const jid = msg.key.remoteJid
      if (text.includes('hi') || text.includes('hello')) {
        await sock.sendMessage(jid, { text: 'Hello! Bot is ONLINE 24/7 🤖✅' })
      }
      if (text === 'test') {
        await sock.sendMessage(jid, { text: 'Test OK! Bot working!' })
      }
    })
  } catch (e) {
    console.log('Error starting bot:', e)
    botStatus = 'Error: ' + e.message + ' - Restarting in 10 sec'
    setTimeout(startBot, 10000)
  }
}

startBot()
