const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, Browsers } = require('@whiskeysockets/baileys')
const P = require('pino')
const express = require('express')
const app = express()

// ================== BOT PROPERTIES - EDIT HERE ==================
const BOT_CONFIG = {
    botName: "My Bot",
    ownerNumber: "6597306863", // your number with country code, no +
    ownerName: "Owner",
    prefix: ".", // command prefix like .menu .ping
    autoRead: false
}
// ===============================================================

let latestQR = ''
const PORT = process.env.PORT || 3000
app.get('/', (req, res) => {
    if (!latestQR) return res.send(`<h1>${BOT_CONFIG.botName} - BOT READY ✅</h1><p>Bot is online 24/7</p>`)
    res.send(`<h1>Scan QR for ${BOT_CONFIG.botName}</h1><img src="${latestQR}" style="width:350px;border:10px solid #fff;box-shadow:0 0 20px #0003"><p>QR expires in 20 sec - page auto refreshes</p><script>setTimeout(()=>location.reload(),20000),20000</script>`)
})
app.listen(PORT, () => console.log('Web on', PORT))

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
            latestQR = await require('qrcode').toDataURL(qr)
            console.log('QR READY ON WEBPAGE')
        }
        if (connection) console.log('Connection:', connection)
        if (connection === 'close') {
            const code = lastDisconnect?.error?.output?.statusCode
            if (code !== DisconnectReason.loggedOut) startBot()
            else console.log('Logged out - delete volume to relink')
        } else if (connection === 'open') {
            latestQR = ''
            console.log('BOT READY -', BOT_CONFIG.botName)
        }
    })

    sock.ev.on('messages.upsert', async (m) => {
        try {
            const msg = m.messages[0]
            if (!msg.message) return
            if (msg.key.fromMe) return
            if (msg.key.remoteJid === 'status@broadcast') return
            if (BOT_CONFIG.autoRead) await sock.readMessages([msg.key])

            const type = Object.keys(msg.message)[0]
            let text = ''
            if (type === 'conversation') text = msg.message.conversation
            else if (type === 'extendedTextMessage') text = msg.message.extendedTextMessage.text
            else if (type === 'imageMessage') text = msg.message.imageMessage.caption || ''
            else if (type === 'videoMessage') text = msg.message.videoMessage.caption || ''
            else if (type === 'buttonsResponseMessage') text = msg.message.buttonsResponseMessage.selectedButtonId
            else if (type === 'listResponseMessage') text = msg.message.listResponseMessage.singleSelectReply.selectedRowId

            if (!text) return
            const jid = msg.key.remoteJid
            const isGroup = jid.endsWith('@g.us')
            const sender = isGroup ? msg.key.participant : jid
            const lower = text.toLowerCase().trim()

            // Check prefix
            if (!lower.startsWith(BOT_CONFIG.prefix) && !['hi','hello','menu','ping'].includes(lower)) return
            
            const cmd = lower.startsWith(BOT_CONFIG.prefix) ? lower.slice(BOT_CONFIG.prefix.length).split(' ')[0] : lower
            const args = text.trim().split(' ').slice(1).join(' ')

            console.log(`CMD: ${cmd} from ${sender}`)

            // ===== COMMANDS =====
            if (cmd === 'hi' || cmd === 'hello') {
                await sock.sendMessage(jid, { text: `Hi! 👋 I'm *${BOT_CONFIG.botName}* online 24/7 ✅` })
            }
            else if (cmd === 'ping') {
                await sock.sendMessage(jid, { text: `Pong! 🏓\nBot: ${BOT_CONFIG.botName}\nStatus: Online` })
            }
            else if (cmd === 'menu' || cmd === 'help') {
                await sock.sendMessage(jid, { text: `*${BOT_CONFIG.botName} MENU*\n\n${BOT_CONFIG.prefix}hi - say hi\n${BOT_CONFIG.prefix}ping - speed check\n${BOT_CONFIG.prefix}menu - this menu\n${BOT_CONFIG.prefix}owner - owner info\n${BOT_CONFIG.prefix}sticker - reply to image with ${BOT_CONFIG.prefix}s\n\n_24/7 Online_` })
            }
            else if (cmd === 'owner') {
                await sock.sendMessage(jid, { text: `*Owner:* ${BOT_CONFIG.ownerName}\n*Number:* ${BOT_CONFIG.ownerNumber}\n*Bot:* ${BOT_CONFIG.botName}` })
            }
            else if (cmd === 's' || cmd === 'sticker') {
                if (msg.message.imageMessage || msg.message.extendedTextMessage?.contextInfo?.quotedMessage?.imageMessage) {
                    await sock.sendMessage(jid, { text: 'Sticker feature: Add sticker code here' })
                } else {
                    await sock.sendMessage(jid, { text: `Send image with caption ${BOT_CONFIG.prefix}s to make sticker` })
                }
            }

        } catch (e) { console.log('Msg Error:', e) }
    })
}
startBot()
