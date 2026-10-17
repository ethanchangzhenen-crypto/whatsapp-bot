const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, Browsers } = require('@whiskeysockets/baileys')
const P = require('pino')
const qrcode = require('qrcode-terminal')

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
            console.log('QR CODE BELOW - Scan it!')
            qrcode.generate(qr, { small: true })
        }

        if (connection) console.log('Connection:', connection)
        
        if (connection === 'close') {
            const statusCode = lastDisconnect?.error?.output?.statusCode
            const shouldReconnect = statusCode !== DisconnectReason.loggedOut
            console.log('Reconnecting:', shouldReconnect, 'Code:', statusCode)
            if (shouldReconnect) {
                startBot()
            } else {
                console.log('Logged out - delete auth folder')
            }
        } else if (connection === 'open') {
            console.log('BOT READY - Bot is online forever!')
        }
    })

    sock.ev.on('messages.upsert', async (m) => {
        const msg = m.messages[0]
        if (!msg.message || msg.key.fromMe) return
        const text = msg.message.conversation || msg.message.extendedTextMessage?.text || ''
        if (text.toLowerCase() === 'hi') {
            await sock.sendMessage(msg.key.remoteJid, { text: 'Bot online 24/7 ✅' })
        }
    })
}

startBot()
