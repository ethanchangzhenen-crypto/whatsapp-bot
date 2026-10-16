const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys')
const express = require('express')
const app = express()

let page = '<h1>Bot Running... If linked, it says LINKED</h1>'
app.get('/', (req,res)=> res.send(page))
app.listen(process.env.PORT||3000)

async function start(){
  const {version} = await fetchLatestBaileysVersion()
  const {state, saveCreds} = await useMultiFileAuthState('./auth_info')
  const sock = makeWASocket({version, auth: state, browser: ["Ubuntu","Chrome","110"]})
  sock.ev.on('creds.update', saveCreds)

  sock.ev.on('connection.update', async (u)=>{
    if(u.qr){
      const QRCode = require('qrcode')
      const qrImg = await QRCode.toDataURL(u.qr)
      page = `<div style="text-align:center;font-family:Arial;padding:20px"><h1>SCAN QR</h1><img src="${qrImg}" style="width:330px"><script>setTimeout(()=>location.reload(),20000)</script></div>`
    }
    if(u.connection==='open'){
      page = '<h1 style="text-align:center;color:green;padding:50px">✅ BOT ONLINE - EMPIRE READY!</h1>'
    }
  })

  // === COMMANDS HERE ===
  sock.ev.on('messages.upsert', async ({messages})=>{
    const m = messages[0]
    if(!m.message || m.key.fromMe) return
    
    const text = (m.message.conversation || m.message.extendedTextMessage?.text || '').toLowerCase().trim()
    const chatId = m.key.remoteJid
    console.log('Got:', text)

    if(text === 'hi' || text === 'hello'){
      await sock.sendMessage(chatId, {text: '👋 Hey! Empire Bot Online!\n\nType *!help* for menu'})
    }
    else if(text === '!help' || text === 'help' || text === '!menu'){
      await sock.sendMessage(chatId, {text: 
`🤖 *EMPIRE BOT MENU* 🤖

*General:*
• hi - Check if bot alive
• !help - This menu

*Fun:*
• !sticker - Reply to image with !sticker to make sticker
• !tagall - Tag all in group
• !ai [question] - Ask AI

*Group Admin:*
• !kick @user
• !add 92xxx
• !promote @user

*Type any command!*
Bot made by you 🔥`})
    }
    else if(text === '!tagall'){
      try{
        const group = await sock.groupMetadata(chatId)
        const mentions = group.participants.map(p=>p.id)
        let txt = `📢 *TAG ALL by Empire Bot:*\n\n`
        for(let p of group.participants){ txt += `@${p.id.split('@')[0]} ` }
        await sock.sendMessage(chatId, {text: txt, mentions: mentions})
      }catch{ await sock.sendMessage(chatId, {text: '❌ Use !tagall inside a group!'}) }
    }
    else if(text.startsWith('!ai ')){
      const question = text.replace('!ai ','')
      await sock.sendMessage(chatId, {text: `🤖 *AI Answer for:* "${question}"\n\nThis is your empire bot AI reply! (Add OpenAI API for real AI)\n\nYour question: ${question}\nAnswer: I'm your empire assistant, working 24/7! 🔥`})
    }
  })
}
start()
