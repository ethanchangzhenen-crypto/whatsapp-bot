const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: true,
        executablePath: '/usr/bin/chromium',
        args: ['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage','--disable-gpu']
    }
});
client.on('qr', (qr) => { console.log('QR READY - SCAN:'); qrcode.generate(qr, {small:true}); });
client.on('ready', () => { console.log('BOT READY 24/7'); });
client.on('message', async (msg) => { if(msg.body.toLowerCase()==='hi'){ msg.reply('Hello! Online 24/7'); } });
client.initialize();
