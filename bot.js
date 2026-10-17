const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, Browsers } = require('@whiskeysockets/baileys')
const P = require('pino')
const express = require('express')
const app = express()
let latestQR = ''

app.get('/', (req, res) => {
    if (!latestQR) return res.send('<h1>Waiting for QR... check logs, or bot already linked -> BOT READY</h1>')
    res.send(`<h1>Scan this QR with WhatsApp</h1><img src="${latestQR}" style="width:400px"><br><p>Refresh if expired</p><script>setTimeout(()=>location.reload(),20000),20000</script>`)
})

app.listen(3000, () => console.log('Web server on 3000'))

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('auth')
    const sock = makeWASocket({
        auth: state,
        logger: P({ level: 'silent' }),
        browser: Browsers.ubuntu('Chrome')
    })
    sock.ev.on('creds.update', saveCreds)

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update
        if (qr) {
            console.log('Got QR')
            latestQR = await require('qrcode').toDataURL(qr)
            console.log('QR ready on webpage!')
        }
        if (connection) console.log('Connection:', connection)
        if (connection === 'close') {
            const code = lastDisconnect?.error?.output?.statusCode
            if (code !== DisconnectReason.loggedOut) startBot()
        } else if (connection === 'open') {
            latestQR = ''
            console.log('BOT READY!')
        }
    })

    sock.ev.on('messages.upsert', async (m) => {
        const msg = m.messages[0]
        if (!msg.message || msg.key.fromMe) return
        const text = msg.message.conversation || ''
        if (text.toLowerCase() === 'hi') await sock.sendMessage(msg.key.remoteJid, { text: 'Bot online!' })
    })
}
startBot()
