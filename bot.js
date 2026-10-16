const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys')
const express = require('express')
const fs = require('fs')
const app = express()
let page = '<h1>Starting... Refresh in 10 sec</h1>'
app.get('/', (req,res)=> res.send(page))
app.listen(process.env.PORT||3000)

let db = {}
if(fs.existsSync('./database.json')){ try{ db = JSON.parse(fs.readFileSync('./database.json')) }catch{} }
function saveDB(){ fs.writeFileSync('./database.json', JSON.stringify(db, null, 2)) }
function getUser(id){ if(!db[id]) db[id] = { money: 1000, daily: 0, properties: [], invested: 0, lastInvest: 0 }; return db[id] }

async function start(){
 const {version} = await fetchLatestBaileysVersion()
 const {state, saveCreds} = await useMultiFileAuthState('./auth_info')
 const sock = makeWASocket({version, auth: state, browser: ["Ubuntu","Chrome","110"]})
 sock.ev.on('creds.update', saveCreds)
 sock.ev.on('connection.update', async (u)=>{
  if(u.qr){
    const QRCode = require('qrcode')
    const qrImg = await QRCode.toDataURL(u.qr)
    page = `<div style="text-align:center"><h2>SCAN QR</h2><img src="${qrImg}" style="width:320px"><p>Or wait for pairing code</p></div>`
    console.log("QR ready")
  }
  if(u.connection==='open'){ page = '<h1 style="color:green;text-align:center">✅ MONEY BOT ONLINE - Now type!help on WhatsApp</h1>'; console.log("ONLINE") }
 })
 if(!state.creds.registered){
   setTimeout(async()=>{
     try{
       let code = await sock.requestPairingCode("6597306863")
       console.log("PAIRING CODE:", code)
       page = `<div style="text-align:center"><h1 style="font-size:60px">CODE: ${code}</h1><p>WhatsApp > Linked Devices > Link with phone number > Enter code</p></div>`
     }catch(e){ console.log("Pair error", e.message) }
   }, 8000)
 }
 sock.ev.on('messages.upsert', async ({messages})=>{
  const m = messages[0]; if(!m.message) return
  if(m.key.id.startsWith('BAE5') && m.key.fromMe) return
  const raw = (m.message.conversation || m.message.extendedTextMessage?.text || '').trim()
  const text = raw.toLowerCase()
  const chatId = m.key.remoteJid
  console.log('MSG:', raw, 'FROMME:', m.key.fromMe)
  const user = getUser(chatId)
  if(text.includes('!help') || text.includes('help') || text === 'hi' || text === 'hello'){
   await sock.sendMessage(chatId, {text:`💰 *MONEY BOT ONLINE* 💰\n\n!balance - check money\n!daily - $1000 free\n!work - work\n!slots 100 - gamble\nType!balance`})
  }
  else if(text.startsWith('!balance') || text.startsWith('!bal')){
   await sock.sendMessage(chatId, {text:`💰 BALANCE: $${user.money}`})
  }
  else if(text === '!daily'){
   const now=Date.now()
   if(now-user.daily<86400000) await sock.sendMessage(chatId, {text:`⏳ Wait`})
   else { user.money+=1000; user.daily=now; saveDB(); await sock.sendMessage(chatId, {text:`✅ +$1000 = $${user.money}`}) }
  }
  else if(text === '!work'){
   const earn=Math.floor(Math.random()*400)+100; user.money+=earn; saveDB(); await sock.sendMessage(chatId, {text:`💼 +$${earn} = $${user.money}`})
  }
 })
}
start()
