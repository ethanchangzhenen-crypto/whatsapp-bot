const express = require("express")
const fs = require("fs")
const QRCode = require("qrcode")
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require("@whiskeysockets/baileys")

const app = express()
const PORT = process.env.PORT || 3000

// Make sure auth folder exists
if (!fs.existsSync("./auth")) fs.mkdirSync("./auth", { recursive: true })

let qrData = null
let isLinked = false
let lastLog = "Starting bot..."

// WEB SERVER MUST START FIRST FOR RAILWAY
app.get("/", (req, res) => {
  if (isLinked) {
    res.send("<h1 style='font-family:sans-serif'>✅ WhatsApp Linked! Bot is Running</h1><p>Keep this Railway URL open.</p><p>Log: "+lastLog+"</p>")
  } else if (qrData) {
    res.send(`<div style="font-family:sans-serif;text-align:center"><h1>Scan QR in WhatsApp</h1><p>WhatsApp > Settings > Linked Devices > Link a Device</p><img src="${qrData}" width="350" style="border:1px solid #ccc"><p>Auto-refresh every 30s</p><p>Log: ${lastLog}</p><script>setTimeout(()=>location.reload(),30000)</script></div>`)
  } else {
    res.send(`<h1>Starting...</h1><p>${lastLog}</p><p>Refresh in 5 sec</p><script>setTimeout(()=>location.reload(),5000)</script>`)
  }
})

app.listen(PORT, '0.0.0.0', () => {
  console.log("Web server running on port " + PORT)
  lastLog = "Web server running, starting WhatsApp..."
  startBot()
})

async function startBot() {
  try {
    const { state, saveCreds } = await useMultiFileAuthState("./auth")
    const sock = makeWASocket({
      auth: state,
      printQRInTerminal: false,
      browser: ["RailwayBot", "Chrome", "1.0"]
    })

    sock.ev.on("creds.update", saveCreds)

    sock.ev.on("connection.update", async (update) => {
      const { connection, lastDisconnect, qr } = update
      if (qr) {
        qrData = await QRCode.toDataURL(qr)
        lastLog = "QR generated - scan now"
        console.log("QR generated")
      }
      if (connection === "open") {
        isLinked = true
        qrData = null
        lastLog = "Linked successfully!"
        console.log("Linked!")
      }
      if (connection === "close") {
        const statusCode = lastDisconnect?.error?.output?.statusCode
        lastLog = "Connection closed: " + statusCode
        console.log("Connection closed", statusCode)
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut
        if (shouldReconnect) {
          setTimeout(startBot, 3000)
        } else {
          isLinked = false
          qrData = null
        }
      }
    })

    sock.ev.on("messages.upsert", async ({ messages }) => {
      for (const m of messages) {
        if (!m.message || m.key.fromMe) continue
        const text = m.message.conversation || m.message.extendedTextMessage?.text || ""
        const from = m.key.remoteJid
        if (text.toLowerCase().includes("loan")) {
          await sock.sendMessage(from, { text: "Loan bot active! You said: " + text })
        }
      }
    })

  } catch (e) {
    lastLog = "Error: " + e.message
    console.error(e)
    setTimeout(startBot, 5000)
  }
}
