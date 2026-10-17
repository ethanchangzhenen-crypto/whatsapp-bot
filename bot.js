const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, Browsers } = require('@whiskeysockets/baileys')
const Boom = require('@hapi/boom')
const P = require('pino')

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('auth')
    
    const sock = makeWASocket({
        auth: state,
        logger: P({ level: 'silent' }),
        browser: Browsers.ubuntu('Chrome'),
        printQRInTerminal: true
    })

    sock.ev.on('creds.update', saveCreds)

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update
        console.log('Connection:', connection)
        
        if (connection === 'close') {
            let statusCode = lastDisconnect?.error?.output?.statusCode
            // if Boom object
            if (lastDisconnect?.error instanceof Boom) {
                statusCode = lastDisconnect.error.output.statusCode
            }
            const shouldReconnect = statusCode !== DisconnectReason.loggedOut
            console.log('Disconnected, reconnecting:', shouldReconnect, 'code:', statusCode)
            if (shouldReconnect) {
                startBot()
            }
        } else if (connection === 'open') {
            console.log('BOT READY - Bot is online forever!')
        }
    })

    sock.ev.on('messages.upsert', async (m) => {
        const msg = m.messages[0]
        if (!msg.message) return
        if (msg.key.fromMe) return
        
        const text = msg.message.conversation || msg.message.extendedTextMessage?.text || ''
        console.log('New message:', text)

        if (text.toLowerCase() === 'hi') {
            await sock.sendMessage(msg.key.remoteJid, { text: 'Hi! Bot is online 24/7' })
        }
    })
}

startBot()
