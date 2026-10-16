const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys')
const express = require('express')
const fs = require('fs')
const app = express()
let page = '<h1>Starting SelfBot...</h1>'
app.get('/', (req,res)=> res.send(page))
app.listen(process.env.PORT||3000)

let db = {}
if(fs.existsSync('./database.json')){ try{ db = JSON.parse(fs.readFileSync('./database.json')) }catch{} }
function saveDB(){ fs.writeFileSync('./database.json', JSON.stringify(db)) }
function getUser(id){ if(!db[id]) db[id] = { money: 1000, daily: 0, props: [], invested: 0, lastInvest: 0 }; return db[id] }

async function start(){
  const {version} = await fetchLatestBaileysVersion()
  const {state, saveCreds} = await useMultiFileAuthState('./auth_info')
  const sock = makeWASocket({version, auth: state, printQRInTerminal: false, browser: ["Ubuntu","Chrome","110"]})
  sock.ev.on('creds.update', saveCreds)
  sock.ev.on('connection.update', async (u)=>{
    if(u.qr){ const QRCode = require('qrcode'); const qr = await QRCode.toDataURL(u.qr); page = `<center><h1>SCAN QR WITH BOT NUMBER</h1><img src="${qr}" width="300"><br>Reloads every 20 sec</center><script>setTimeout(()=>location.reload(),20000)</script>` }
    if(u.connection==='open'){ page = '<h1 style="color:green;text-align:center">✅ SELF-BOT ONLINE - YOU ARE THE BOT!</h1>'; console.log('✅ ONLINE - SelfBot Ready!') }
  })

  sock.ev.on('messages.upsert', async ({messages})=>{
    const m = messages[0]
    if(!m.message) return
    const raw = (m.message.conversation || m.message.extendedTextMessage?.text || '').trim()
    if(!raw.startsWith('!') && raw.toLowerCase()!=='hi') return // Only react to commands
    // Allow YOUR own messages! Block only bot's auto replies to prevent loop
    if(raw.includes('BALANCE:') || raw.includes('MONEY BOT MENU')) return

    const text = raw.toLowerCase()
    const chatId = m.key.remoteJid
    const sender = m.key.participant || chatId
    console.log('COMMAND:', raw, 'IN:', chatId)
    const user = getUser(sender)

    if(text==='!help' || text==='!menu'){
      await sock.sendMessage(chatId, {text:`💰 *SELF-BOT MENU (You are the bot!)* 💰\n\n!balance - Your money\n!daily - Free $1000 daily\n!work - Earn $100-500\n!slots 100 - Slots\n!buy house - $5000 house\n!properties - Shop\n!invest 1000 - 20% profit\n!collect - Collect profit\n!leaderboard - Top\n\nType!balance`})
    }
    else if(text==='!balance' || text==='!bal'){
      await sock.sendMessage(chatId, {text:`💰 *BALANCE: $${user.money}*\n🏠 Props: ${user.props.length} | 📈 Invested: $${user.invested}`})
    }
    else if(text==='!daily'){
      const now=Date.now()
      if(now-user.daily<86400000){ await sock.sendMessage(chatId, {text:`⏳ Already claimed! ${Math.ceil((86400000-(now-user.daily))/3600000)}h left`}) }
      else { user.money+=1000; user.daily=now; saveDB(); await sock.sendMessage(chatId, {text:`✅ DAILY +$1000! Balance: $${user.money}`}) }
    }
    else if(text==='!work'){ const earn=Math.floor(Math.random()*400)+100; user.money+=earn; saveDB(); await sock.sendMessage(chatId, {text:`💼 Work +$${earn} = $${user.money}`}) }
    else if(text.startsWith('!slots ')){
      const amt=parseInt(text.split(' ')[1]); if(!amt||user.money<amt){ await sock.sendMessage(chatId, {text:`❌ Need $${amt} have $${user.money}`}); return }
      const s=['🍒','🍋','💎','7️⃣','🍀']; const r1=s[Math.floor(Math.random()*5)], r2=s[Math.floor(Math.random()*5)], r3=s[Math.floor(Math.random()*5)]
      if(r1===r2&&r2===r3){ const w=amt*5; user.money+=w; saveDB(); await sock.sendMessage(chatId, {text:`🎰 [${r1}|${r2}|${r3}] JACKPOT +$${w}! = $${user.money}`}) }
      else if(r1===r2||r2===r3||r1===r3){ const w=amt*2; user.money+=w; saveDB(); await sock.sendMessage(chatId, {text:`🎰 [${r1}|${r2}|${r3}] WIN +$${w}! = $${user.money}`}) }
      else { user.money-=amt; saveDB(); await sock.sendMessage(chatId, {text:`🎰 [${r1}|${r2}|${r3}] LOST $${amt}. Bal: $${user.money}`}) }
    }
    else if(text==='!properties'){ await sock.sendMessage(chatId, {text:`🏠 SHOP:\n house $5k\n shop $15k\n hotel $50k\n mall $200k\n\n!buy house`}) }
    else if(text.startsWith('!buy ')){ const p=text.split(' ')[1]; const prices={house:5000,shop:15000,hotel:50000,mall:200000}; if(!prices[p]){ await sock.sendMessage(chatId, {text:'❌ No such prop'}); return } if(user.money<prices[p]){ await sock.sendMessage(chatId, {text:`❌ Need $${prices[p]}`}); return } user.money-=prices[p]; user.props.push(p); saveDB(); await sock.sendMessage(chatId, {text:`✅ Bought ${p}! Bal: $${user.money}`}) }
    else if(text==='!leaderboard'){ const top=Object.entries(db).sort((a,b)=>b[1].money-a[1].money).slice(0,5); let t='🏆 TOP 5\n'; top.forEach((u,i)=>t+=`${i+1}. @${u[0].split('@')[0]} $${u[1].money}\n`); await sock.sendMessage(chatId, {text:t, mentions: top.map(u=>u[0])}) }
  })
}
start()
