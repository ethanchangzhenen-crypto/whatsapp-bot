const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, Browsers } = require('@whiskeysockets/baileys')
const { Boom } = require('@hapi/boom')
const P = require('pino')

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('auth')
    
    const sock = makeWASocket({
        auth: state,
        logger: P({ level: 'silent' }),
        browser: Browsers.ubuntu('Chrome'),
        printQRInTerminal: true,
        syncFullHistory: false
    })

    sock.ev.on('creds.update', saveCreds)

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update
        console.log('Connection:', connection)
        
        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect?.error as Boom)?.output?.statusCode !== DisconnectReason.loggedOut
            console.log('Disconnected, reconnecting:', shouldReconnect)
            if (shouldReconnect) {
                startBot()
            } else {
                console.log('Logged out, delete auth folder')
            }
        } else if (connection === 'open') {
            console.log('BOT READY - Bot is online forever!')
        }
    })

    // YOUR BOT COMMANDS HERE
    sock.ev.on('messages.upsert', async (m) => {
        const msg = m.messages[0]
        if (!msg.message) return
        if (msg.key.fromMe) return
        
        const text = msg.message.conversation || msg.message.extendedTextMessage?.text || ''
        console.log('Message:', text)

        if (text.toLowerCase() === 'hi' || text.toLowerCase() === 'hello') {
            await sock.sendMessage(msg.key.remoteJid, { text: 'Hi! Bot is online 24/7 ✅' })
        }
    })
}

startBot()
