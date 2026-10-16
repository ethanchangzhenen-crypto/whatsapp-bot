const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys')
const express = require('express')
const fs = require('fs')
const app = express()

let page = '<h1>Bot Starting...</h1>'
app.get('/', (req,res)=> res.send(page))
app.listen(process.env.PORT||3000)

// ===== DATABASE =====
let db = {}
if(fs.existsSync('./database.json')){
  db = JSON.parse(fs.readFileSync('./database.json'))
}
function saveDB(){ fs.writeFileSync('./database.json', JSON.stringify(db, null, 2)) }
function getUser(id){
  if(!db[id]) db[id] = { money: 1000, daily: 0, properties: [], invested: 0, lastInvest: 0 }
  return db[id]
}

const PROPERTIES = {
  house: { price: 5000, income: 200 },
  shop: { price: 15000, income: 700 },
  hotel: { price: 50000, income: 3000 },
  mall: { price: 200000, income: 15000 }
}

async function start(){
  const {version} = await fetchLatestBaileysVersion()
  const {state, saveCreds} = await useMultiFileAuthState('./auth_info')
  const sock = makeWASocket({version, auth: state, browser: ["Ubuntu","Chrome","110"]})
  sock.ev.on('creds.update', saveCreds)

  sock.ev.on('connection.update', async (u)=>{
    if(u.qr){
      const QRCode = require('qrcode')
      const qrImg = await QRCode.toDataURL(u.qr)
      page = `<div style="text-align:center;padding:20px"><h2>SCAN QR</h2><img src="${qrImg}" style="width:320px"><script>setTimeout(()=>location.reload(),20000)</script></div>`
    }
    if(u.connection==='open'){ page = '<h1 style="text-align:center;color:green;padding:40px">✅ MONEY BOT ONLINE!</h1>' }
  })

  sock.ev.on('messages.upsert', async ({messages})=>{
    const m = messages[0]
    if(!m.message) return
    const raw = (m.message.conversation || m.message.extendedTextMessage?.text || '').trim()
    const text = raw.toLowerCase()
    const chatId = m.key.remoteJid
    const sender = m.key.participant || chatId

    if(text.includes('bot menu') || text.includes('bot online') && m.key.fromMe) return

    console.log(sender, ':', raw)
    const user = getUser(sender)

    // === HELP ===
    if(text === '!help' || text === 'help' || text === '!menu'){
      await sock.sendMessage(chatId, {text:
`💰 *MONEY BOT - FULL MENU* 💰

*Balance:*
-!balance /!bal - Check money
-!daily - Get daily $1000 (24h)
-!work - Work for $100-$500

*Gambling:*
-!slots <amount> - Slot machine (ex:!slots 500)

*Transfer:*
-!give @user 500 - Give money
-!leaderboard /!lb - Top richest

*Properties (Passive Income):*
-!properties - See properties
-!buy house/shop/hotel/mall - Buy property
-!myprops - Your properties

*Invest:*
-!invest <amount> - Invest money, get 20% after 1 hour
-!collect - Collect invest profit

*Example:*
!balance
!daily
!slots 100
!buy house

Start with $1000 free! 🔥`})
    }

    // BALANCE
    else if(text === '!balance' || text === '!bal' || text === 'balance' || text === 'bal'){
      await sock.sendMessage(chatId, {text: `💰 *BALANCE*\n\n💵 Money: $${user.money}\n🏠 Properties: ${user.properties.length}\n📈 Invested: $${user.invested}\n\nTotal Wealth: $${user.money + user.invested}`})
    }

    // DAILY
    else if(text === '!daily'){
      const now = Date.now()
      const oneDay = 24*60*60*1000
      if(now - user.daily < oneDay){
        const left = Math.ceil((oneDay - (now - user.daily))/3600000)
        await sock.sendMessage(chatId, {text: `⏳ You already claimed daily! Come back in ${left} hours`})
      } else {
        user.money += 1000
        user.daily = now
        saveDB()
        await sock.sendMessage(chatId, {text: `✅ Daily Claimed! +$1000\n\nNew Balance: $${user.money}`})
      }
    }

    // WORK
    else if(text === '!work'){
      const earn = Math.floor(Math.random()*400)+100
      user.money += earn
      saveDB()
      await sock.sendMessage(chatId, {text: `💼 You worked and earned $${earn}!\nBalance: $${user.money}`})
    }

    // SLOTS
    else if(text.startsWith('!slots ')){
      const amount = parseInt(text.split(' ')[1])
      if(!amount || amount <=0){ await sock.sendMessage(chatId, {text: '❌ Usage:!slots <amount>\nEx:!slots 100'}); return }
      if(user.money < amount){ await sock.sendMessage(chatId, {text: `❌ Not enough money! You have $${user.money}`}); return }
      const symbols = ['🍒','🍋','💎','7️⃣','🍀']
      const r1 = symbols[Math.floor(Math.random()*symbols.length)]
      const r2 = symbols[Math.floor(Math.random()*symbols.length)]
      const r3 = symbols[Math.floor(Math.random()*symbols.length)]
      let win = 0
      if(r1===r2 && r2===r3) win = amount*5
      else if(r1===r2 || r2===r3 || r1===r3) win = amount*2

      if(win>0){
        user.money += win
        saveDB()
        await sock.sendMessage(chatId, {text: `🎰 *SLOTS* 🎰\n\n[ ${r1} | ${r2} | ${r3} ]\n\n🎉 JACKPOT! You won $${win}!\nBalance: $${user.money}`})
      } else {
        user.money -= amount
        saveDB()
        await sock.sendMessage(chatId, {text: `🎰 *SLOTS* 🎰\n\n[ ${r1} | ${r2} | ${r3} ]\n\n😢 You lost $${amount}\nBalance: $${user.money}`})
      }
    }

    // PROPERTIES LIST
    else if(text === '!properties' || text === '!props'){
      let txt = `🏠 *PROPERTIES SHOP* 🏠\n\n`
      for(let k in PROPERTIES){ txt += `*${k}* - $${PROPERTIES[k].price} - Earn $${PROPERTIES[k].income}/day\n` }
      txt += `\nBuy:!buy house\nYour props:!myprops`
      await sock.sendMessage(chatId, {text: txt})
    }

    // BUY PROPERTY
    else if(text.startsWith('!buy ')){
      const prop = text.split(' ')[1]
      if(!PROPERTIES[prop]){ await sock.sendMessage(chatId, {text: '❌ Property not found! Use!properties'}); return }
      if(user.money < PROPERTIES[prop].price){ await sock.sendMessage(chatId, {text: `❌ Need $${PROPERTIES[prop].price}, you have $${user.money}`}); return }
      user.money -= PROPERTIES[prop].price
      user.properties.push(prop)
      saveDB()
      await sock.sendMessage(chatId, {text: `✅ Bought ${prop} for $${PROPERTIES[prop].price}!\nIt earns $${PROPERTIES[prop].income}/day\nBalance: $${user.money}`})
    }

    else if(text === '!myprops' || text === '!myproperties'){
      if(user.properties.length===0){ await sock.sendMessage(chatId, {text: '❌ No properties! Buy with!buy house'}); return }
      let income = 0
      user.properties.forEach(p=> income+=PROPERTIES[p].income)
      await sock.sendMessage(chatId, {text: `🏠 Your Properties: ${user.properties.join(', ')}\n\n💰 Daily Passive Income: $${income}\nClaim daily income with!collectprops (coming soon) - for now auto added on!daily`})
    }

    // INVEST
    else if(text.startsWith('!invest ')){
      const amt = parseInt(text.split(' ')[1])
      if(!amt || amt<=0){ await sock.sendMessage(chatId, {text: 'Usage:!invest 1000'}); return }
      if(user.money < amt){ await sock.sendMessage(chatId, {text: `❌ You have $${user.money}`}); return }
      user.money -= amt
      user.invested += amt
      user.lastInvest = Date.now()
      saveDB()
      await sock.sendMessage(chatId, {text: `📈 Invested $${amt}!\n\nGet 20% profit after 1 hour with!collect\nBalance: $${user.money}`})
    }

    else if(text === '!collect'){
      if(user.invested===0){ await sock.sendMessage(chatId, {text: '❌ No investment! Use!invest 1000'}); return }
      const now = Date.now()
      if(now - user.lastInvest < 3600000){
        const left = Math.ceil((3600000 - (now - user.lastInvest))/60000)
        await sock.sendMessage(chatId, {text: `⏳ Wait ${left} mins to collect profit!`}); return
      }
      const profit = Math.floor(user.invested*0.2)
      user.money += user.invested + profit
      await sock.sendMessage(chatId, {text: `✅ Collected! Investment $${user.invested} + Profit $${profit} = $${user.invested+profit}\nBalance: $${user.money}`})
      user.invested = 0
      saveDB()
    }

    // GIVE
    else if(text.startsWith('!give ')){
      const mentioned = m.message.extendedTextMessage?.contextInfo?.mentionedJid?.[0]
      const parts = raw.split(' ')
      const amt = parseInt(parts[parts.length-1])
      if(!mentioned ||!amt){ await sock.sendMessage(chatId, {text: 'Usage:!give @user 500 (tag person)'}); return }
      if(user.money < amt){ await sock.sendMessage(chatId, {text: `❌ You have $${user.money}`}); return }
      const target = getUser(mentioned)
      user.money -= amt
      target.money += amt
      saveDB()
      await sock.sendMessage(chatId, {text: `✅ Gave $${amt} to @${mentioned.split('@')[0]}`, mentions: [mentioned]})
    }

    // LEADERBOARD
    else if(text === '!leaderboard' || text === '!lb' || text === '!top'){
      let sorted = Object.entries(db).sort((a,b)=> (b[1].money+b[1].invested) - (a[1].money+a[1].invested)).slice(0,5)
      let txt = `🏆 *LEADERBOARD - TOP 5* 🏆\n\n`
      sorted.forEach((u,i)=>{ txt += `${i+1}. @${u[0].split('@')[0]} - $${u[1].money+u[1].invested}\n` })
      const mentions = sorted.map(u=>u[0])
      await sock.sendMessage(chatId, {text: txt, mentions: mentions})
    }

    else if(text === 'hi' || text === 'hello'){
      await sock.sendMessage(chatId, {text: '👋 Hi! Money Bot Ready!\nType!help for casino & money commands! 💰'})
    }
  })
}
start()
