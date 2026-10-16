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
  if(u.qr){ const QRCode = require('qrcode'); const qrImg = await QRCode.toDataURL(u.qr); page = `<div style="text-align:center"><h2>SCAN THIS ON 97306863</h2><img src="${qrImg}" style="width:320px"></div>`; console.log('QR Generated') }
  if(u.connection==='open'){ page = '<h1 style="color:green;text-align:center">✅ MONEY BOT ONLINE</h1>'; console.log('CONNECTED') }
 })
 sock.ev.on('messages.upsert', async ({messages})=>{
  const m = messages[0]
  if(!m.message) return
  // FIX: Only block Baileys system messages, ALLOW self messages
  if(m.key.id.startsWith('BAE5') && m.key.fromMe) return

  const raw = (m.message.conversation || m.message.extendedTextMessage?.text || '').trim()
  const text = raw.toLowerCase()
  const chatId = m.key.remoteJid
  const sender = m.key.participant || chatId
  console.log('MSG:', raw, 'FROMME:', m.key.fromMe)
  const user = getUser(sender)

  if(text === '!help' || text === 'help' || text === '!menu'){
   await sock.sendMessage(chatId, {text:`💰 *MONEY BOT MENU* 💰\n\n!balance - Check money\n!daily - Free $1000 daily\n!work - Work $100-500\n!slots 100 - Slots gamble\n!properties - See shop\n!buy house - Buy property\n!myprops - Your props\n!invest 1000 - Invest 20%\n!collect - Collect invest\n!leaderboard - Top richest\n\nTry:!balance`})
  }
  else if(text === '!balance' || text === '!bal'){
   await sock.sendMessage(chatId, {text:`💰 BALANCE: $${user.money}\n🏠 Props: ${user.properties.length}\n📈 Invested: $${user.invested}`})
  }
  else if(text === '!daily'){
   const now = Date.now()
   if(now - user.daily < 86400000){ await sock.sendMessage(chatId, {text:`⏳ Already claimed! Wait ${Math.ceil((86400000-(now-user.daily))/3600000)}h`}) }
   else { user.money+=1000; user.daily=now; saveDB(); await sock.sendMessage(chatId, {text:`✅ +$1000 Daily! Balance: $${user.money}`}) }
  }
  else if(text === '!work'){
   const earn = Math.floor(Math.random()*400)+100; user.money+=earn; saveDB(); await sock.sendMessage(chatId, {text:`💼 Worked +$${earn} = $${user.money}`})
  }
  else if(text.startsWith('!slots ')){
   const amount = parseInt(text.split(' ')[1]); if(!amount || user.money<amount){ await sock.sendMessage(chatId, {text:`❌ Need $${amount}, you have $${user.money}`}); return }
   const sym = ['🍒','🍋','💎','7️⃣','🍀']; const r1=sym[Math.floor(Math.random()*5)], r2=sym[Math.floor(Math.random()*5)], r3=sym[Math.floor(Math.random()*5)]
   if(r1===r2 && r2===r3){ const win=amount*5; user.money+=win; saveDB(); await sock.sendMessage(chatId, {text:`🎰 [${r1}|${r2}|${r3}] 🎉 WIN $${win}! Bal: $${user.money}`}) }
   else if(r1===r2||r2===r3||r1===r3){ const win=amount*2; user.money+=win; saveDB(); await sock.sendMessage(chatId, {text:`🎰 [${r1}|${r2}|${r3}] WIN $${win}! Bal: $${user.money}`}) }
   else { user.money-=amount; saveDB(); await sock.sendMessage(chatId, {text:`🎰 [${r1}|${r2}|${r3}] LOST $${amount}. Bal: $${user.money}`}) }
  }
  else if(text === '!properties' || text === '!props'){
   await sock.sendMessage(chatId, {text:`🏠 SHOP:\n house $5000 = $200/day\n shop $15000 = $700/day\n hotel $50000 = $3000/day\n mall $200000 = $15000/day\n\n!buy house`})
  }
  else if(text.startsWith('!buy ')){
   const prop=text.split(' ')[1]; if(!PROPERTIES[prop]){ await sock.sendMessage(chatId, {text:'❌ No prop!'}); return }
   if(user.money<PROPERTIES[prop].price){ await sock.sendMessage(chatId, {text:`❌ Need $${PROPERTIES[prop].price}`}); return }
   user.money-=PROPERTIES[prop].price; user.properties.push(prop); saveDB(); await sock.sendMessage(chatId, {text:`✅ Bought ${prop}! Bal: $${user.money}`})
  }
  else if(text === '!myprops'){ await sock.sendMessage(chatId, {text:`🏠 Props: ${user.properties.join(', ')||'none'}`}) }
  else if(text.startsWith('!invest ')){
   const amt=parseInt(text.split(' ')[1]); if(!amt||user.money<amt){ await sock.sendMessage(chatId, {text:`❌ Need $${amt}`}); return }
   user.money-=amt; user.invested+=amt; user.lastInvest=Date.now(); saveDB(); await sock.sendMessage(chatId, {text:`📈 Invested $${amt}. Use!collect after 1h`})
  }
  else if(text === '!collect'){
   if(user.invested===0){ await sock.sendMessage(chatId, {text:'❌ No invest'}); return }
   if(Date.now()-user.lastInvest<3600000){ await sock.sendMessage(chatId, {text:'⏳ Wait 1 hour!'}); return }
   const profit=Math.floor(user.invested*0.2); user.money+=user.invested+profit; await sock.sendMessage(chatId, {text:`✅ Collected $${user.invested+profit} (Profit $${profit}) Bal: $${user.money}`}); user.invested=0; saveDB()
  }
  else if(text === 'hi' || text === 'hello'){ await sock.sendMessage(chatId, {text:'👋 Bot Online! Type!help for money commands 💰'}) }
 })
}
start()
