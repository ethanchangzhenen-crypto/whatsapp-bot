const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys')
const express = require('express')
const fs = require('fs')
const app = express()
let page = '<h1>Starting...</h1>'
app.get('/', (req,res)=> res.send(page))
app.listen(process.env.PORT||3000)

let db = {}
if(fs.existsSync('./database.json')){ try{ db = JSON.parse(fs.readFileSync('./database.json')) }catch{} }
function saveDB(){ fs.writeFileSync('./database.json', JSON.stringify(db, null, 2)) }
function getUser(id){ if(!db[id]) db[id] = { money: 1000, daily: 0, properties: [], invested: 0, lastInvest: 0 }; return db[id] }
const PROPERTIES = { house:{price:5000,income:200}, shop:{price:15000,income:700}, hotel:{price:50000,income:3000}, mall:{price:200000,income:15000} }

async function start(){
 const {version} = await fetchLatestBaileysVersion()
 const {state, saveCreds} = await useMultiFileAuthState('./auth_info')
 const sock = makeWASocket({version, auth: state, browser: ["Ubuntu","Chrome","110"]})
 sock.ev.on('creds.update', saveCreds)
 sock.ev.on('connection.update', async (u)=>{
  if(u.qr){ const QRCode = require('qrcode'); const qrImg = await QRCode.toDataURL(u.qr); page = `<div style="text-align:center"><h2>SCAN</h2><img src="${qrImg}" style="width:320px"></div>` }
  if(u.connection==='open'){ page = '<h1 style="color:green;text-align:center">✅ ONLINE</h1>' }
 })
 // PAIRING CODE IF NOT REGISTERED
 if(!state.creds.registered){
   setTimeout(async()=>{
     try{
       let code = await sock.requestPairingCode("6597306863")
       console.log("PAIRING CODE:", code)
       page = `<div style="text-align:center"><h1>CODE: ${code}</h1><p>WhatsApp > Linked Devices > Link with phone number</p></div>`
     }catch(e){ console.log(e) }
   }, 5000)
 }

 sock.ev.on('messages.upsert', async ({messages})=>{
  const m = messages[0]; if(!m.message) return
  if(m.key.id.startsWith('BAE5') && m.key.fromMe) return
  const raw = (m.message.conversation || m.message.extendedTextMessage?.text || '').trim()
  const text = raw.toLowerCase()
  const chatId = m.key.remoteJid; const sender = m.key.participant || chatId
  console.log('MSG:', raw)
  const user = getUser(sender)
  if(text === '!help' || text === 'help'){ await sock.sendMessage(chatId, {text:`💰 MENU\n!balance\n!daily\n!work\n!slots 100\n!properties\n!buy house\n!myprops\n!invest 1000\n!collect`}) }
  else if(text.startsWith('!balance') || text.startsWith('!bal')){ await sock.sendMessage(chatId, {text:`💰 BAL: $${user.money}`}) }
  else if(text === '!daily'){ const now=Date.now(); if(now-user.daily<86400000){ await sock.sendMessage(chatId, {text:`⏳ Wait ${Math.ceil((86400000-(now-user.daily))/3600000)}h`}) } else { user.money+=1000; user.daily=now; saveDB(); await sock.sendMessage(chatId, {text:`✅ +$1000 = $${user.money}`}) } }
  else if(text === '!work'){ const earn=Math.floor(Math.random()*400)+100; user.money+=earn; saveDB(); await sock.sendMessage(chatId, {text:`💼 +$${earn} = $${user.money}`}) }
  else if(text.startsWith('!slots ')){ const amount=parseInt(text.split(' ')[1]); if(!amount||user.money<amount){ await sock.sendMessage(chatId, {text:`❌ Need $${amount}`}); return } const sym=['🍒','🍋','💎','7️⃣','🍀']; const r1=sym[Math.floor(Math.random()*5)], r2=sym[Math.floor(Math.random()*5)], r3=sym[Math.floor(Math.random()*5)]; if(r1===r2&&r2===r3){ const win=amount*5; user.money+=win; saveDB(); await sock.sendMessage(chatId, {text:`🎰 [${r1}|${r2}|${r3}] WIN $${win}! $${user.money}`}) } else if(r1===r2||r2===r3||r1===r3){ const win=amount*2; user.money+=win; saveDB(); await sock.sendMessage(chatId, {text:`🎰 [${r1}|${r2}|${r3}] WIN $${win}! $${user.money}`}) } else { user.money-=amount; saveDB(); await sock.sendMessage(chatId, {text:`🎰 [${r1}|${r2}|${r3}] LOST $${amount}. $${user.money}`}) } }
  else if(text === 'hi' || text === 'hello'){ await sock.sendMessage(chatId, {text:'👋 Bot Online! Type!help'}) }
 })
}
start()
}
