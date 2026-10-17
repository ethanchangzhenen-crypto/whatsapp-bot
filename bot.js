const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, Browsers } = require('@whiskeysockets/baileys')
const P = require('pino')

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('auth')
    
    const sock = makeWASocket({
        auth: state,
        logger: P({ level: 'silent' }),
        browser: Browsers.ubuntu('Chrome')
    })

    sock.ev.on('creds.update', saveCreds)

    // USE PAIRING CODE INSTEAD OF QR
    if (!state.creds.registered) {
        const phoneNumber = "6597306863" // <-- CHANGE THIS TO YOUR NUMBER with country code, no + or space
        console.log('Requesting pairing code for:', phoneNumber)
        setTimeout(async () => {
            let code = await sock.requestPairingCode(phoneNumber)
            console.log('PAIRING CODE:', code)
            console.log('Go to WhatsApp > Linked Devices > Link with phone number > Enter this code:', code)
        }, 3000)
    }

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update
        if (connection) console.log('Connection:', connection)
        
        if (connection === 'close') {
            const statusCode = lastDisconnect?.error?.output?.statusCode
            const shouldReconnect = statusCode !== DisconnectReason.loggedOut
            console.log('Reconnect:', shouldReconnect)
            if (shouldReconnect) startBot()
        } else if (connection === 'open') {
            console.log('BOT READY - Bot is online forever!')
        }
    })

    sock.ev.on('messages.upsert', async (m) => {
        const msg = m.messages[0]
        if (!msg.message || msg.key.fromMe) return
        const text = msg.message.conversation || ''
        if (text.toLowerCase() === 'hi') {
            await sock.sendMessage(msg.key.remoteJid, { text: 'Bot online 24/7 ✅' })
        }
    })
}

startBot()
