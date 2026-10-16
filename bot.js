const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys')
const qrcode = require('qrcode')
const express = require('express')
const fs = require('fs')
const app = express()

let qrImage = null
let botStatus = 'Starting Empire Bot...'

// ===== PROPERTIES =====
const PROPERTIES = {
  stall: { name: '🍋 Lemonade Stall', price: 500, income: 15, emoji: '🍋' },
  shop: { name: '🏪 Mini Shop', price: 2500, income: 80, emoji: '🏪' },
  cafe: { name: '☕ Cafe', price: 10000, income: 350, emoji: '☕' },
  motel: { name: '🏨 Motel', price: 40000, income: 1500, emoji: '🏨' },
  mall: { name: '🏬 Mall', price: 150000, income: 6500, emoji: '🏬' },
  tower: { name: '🏙️ Skyscraper', price: 700000, income: 30000, emoji: '🏙️' }
}

const DB_FILE = './database.json'
let db = { users: {} }

function loadDB() {
  try { if (fs.existsSync(DB_FILE)) db = JSON.parse(fs.readFileSync(DB_FILE)) } catch {}
}
function saveDB() { fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2)) }
loadDB()

function getUser(jid) {
  if (!db.users[jid]) {
    db.users[jid] = { money: 1000, properties: [], lastDaily: 0, name: jid.split('@')[0] }
  }
  return db.users[jid]
}
function calcIncome(prop) {
  const def = PROPERTIES[prop.id]
  const hours = (Date.now() - prop.lastCollected) / (1000*60*60)
  return Math.floor(def.income * prop.level * hours)
}
function getTotalPending(user) {
  let total = 0
  user.properties.forEach(p => total += calcIncome(p))
  return total
}

// ===== WEB QR =====
app.get('/', (req, res) => {
  if (qrImage) {
    res.send(`<div style="text-align:center;font-family:Arial;padding:20px"><h1>SCAN QR - EMPIRE BOT READY</h1><img src="${qrImage}" style="width:340px;border:10px solid black"><p>QR refreshes in 20s</p><script>setTimeout(()=>location.reload(),20000)</script></div>`)
  } else {
    res.send(`<div style="text-align:center;font-family:Arial"><h2>${botStatus}</h2><p>${new Date().toLocaleTimeString()}</p><script>setTimeout(()=>location.reload(),5000)</script></div>`)
  }
})
app.listen(process.env.PORT || 3000, () => console.log('Web running'))

// ===== BOT =====
async function startBot() {
  const { version } = await fetchLatestBaileysVersion()
  const { state, saveCreds } = await useMultiFileAuthState('auth_info')
  const sock = makeWASocket({ version, auth: state, browser: ["Ubuntu","Chrome","20.0.04"], printQRInTerminal: false })
  sock.ev.on('creds.update', saveCreds)
  sock.ev.on('connection.update', async (u) => {
    const { connection, lastDisconnect, qr } = u
    if (qr) qrImage = await qrcode.toDataURL(qr)
    if (connection === 'open') { qrImage = null; botStatus = '💰 EMPIRE BOT READY 24/7! Owner can play!' }
    if (connection === 'close') {
      const code = lastDisconnect?.error?.output?.statusCode
      if (code!== DisconnectReason.loggedOut) setTimeout(startBot, 5000)
    }
  })

  sock.ev.on('messages.upsert', async ({ messages }) => {
    const m = messages[0]
    if (!m.message) return
    const text = (m.message.conversation || m.message.extendedTextMessage?.text || '').trim()
    if (!text) return

    const jid = m.key.remoteJid
    const isGroup = jid.endsWith('@g.us')
    // FIX: Allow owner (fromMe) to play!
    const senderJid = m.key.fromMe? sock.user.id : (isGroup? m.key.participant : jid)
    const lower = text.toLowerCase()
    const user = getUser(senderJid)
    const args = text.split(' ')
    const cmd = args[0].toLowerCase().replace('!','')

    // Only respond to commands or hi
    if (!text.startsWith('!') &&!['hi','hello'].includes(lower)) return
    // Prevent bot replying to its own non-command messages
    if (m.key.fromMe &&!text.startsWith('!') &&!['hi','hello'].includes(lower)) return

    try {
      if (['help','menu','commands'].includes(cmd) || ['hi','hello'].includes(lower)) {
        await sock.sendMessage(jid, { text:
`💰 *MONEY EMPIRE BOT* 💰
You have: $${user.money}

*💵 MONEY:*
!balance - Check money
!daily - Free $500 / 24h
!collect - Collect from properties
!leaderboard - Top rich

*🏠 PROPERTIES:*
!shop - See shop
!buy <name> - Buy (stall/shop/cafe/motel/mall/tower)
!myprops - Your properties
!upgrade <name> - Upgrade (cost = price x level)

*🤝*
!give @tag amount - Give money

Ex:!buy shop
Collect hourly to get RICH!` })
      }
      else if (['balance','money','bal'].includes(cmd)) {
        const pending = getTotalPending(user)
        await sock.sendMessage(jid, { text: `💳 *YOU*\n💰 Wallet: $${user.money}\n📦 Pending: $${pending} (!collect)\n🏠 Props: ${user.properties.length}` })
      }
      else if (cmd==='daily') {
        const now = Date.now()
        if (now - user.lastDaily < 24*60*60*1000) {
          const left = Math.ceil((24*60*60*1000 - (now-user.lastDaily))/3600000)
          await sock.sendMessage(jid, { text: `⏰ Come back in ${left}h!` })
        } else {
          user.money += 500; user.lastDaily = now; saveDB()
          await sock.sendMessage(jid, { text: `✅ +$500! Balance: $${user.money}` })
        }
      }
      else if (cmd==='shop') {
        let txt = `🏪 *SHOP* You: $${user.money}\n\n`
        for (let id in PROPERTIES) { const p=PROPERTIES[id]; txt+=`${p.emoji} ${id} - ${p.name}\nPrice:$${p.price} | $${p.income}/hr\n\n` }
        txt+=`Buy:!buy stall`
        await sock.sendMessage(jid, { text: txt })
      }
      else if (cmd==='buy') {
        const id = args[1]?.toLowerCase()
        if (!PROPERTIES[id]) return sock.sendMessage(jid, { text: `❌ Use: stall, shop, cafe, motel, mall, tower` })
        const prop = PROPERTIES[id]
        if (user.money < prop.price) return sock.sendMessage(jid, { text: `❌ Need $${prop.price}, you have $${user.money}` })
        user.money -= prop.price
        user.properties.push({ id, level: 1, lastCollected: Date.now() })
        saveDB()
        await sock.sendMessage(jid, { text: `✅ Bought ${prop.name} for $${prop.price}!\nEarns $${prop.income}/hr` })
      }
      else if (['myprops','properties','props'].includes(cmd)) {
        if (user.properties.length===0) return sock.sendMessage(jid, { text: `You own nothing!!shop` })
        let txt = `🏠 *YOUR EMPIRE*\n\n`
        user.properties.forEach((p,i)=>{ const def=PROPERTIES[p.id]; const pend=calcIncome(p); txt+=`${i+1}. ${def.name} Lv.${p.level}\n$${def.income*p.level}/hr | Pending:$${pend}\n\n` })
        txt+=`Total pending:$${getTotalPending(user)}\n!collect`
        await sock.sendMessage(jid, { text: txt })
      }
      else if (cmd==='collect') {
        const total = getTotalPending(user)
        if (total===0) return sock.sendMessage(jid, { text: `Nothing yet! Wait ⏰` })
        user.properties.forEach(p=>p.lastCollected=Date.now()); user.money+=total; saveDB()
        await sock.sendMessage(jid, { text: `💰 COLLECTED $${total}!\nBalance:$${user.money}` })
      }
      else if (cmd==='upgrade') {
        const id = args[1]?.toLowerCase()
        const idx = user.properties.findIndex(p=>p.id===id)
        if (idx===-1) return sock.sendMessage(jid, { text: `You don't own ${id}!` })
        const def=PROPERTIES[id]; const cost=def.price*user.properties[idx].level
        if (user.money < cost) return sock.sendMessage(jid, { text: `❌ Need $${cost}, you have $${user.money}` })
        user.money-=cost; user.properties[idx].level+=1; saveDB()
        await sock.sendMessage(jid, { text: `⬆️ ${def.name} Lv.${user.properties[idx].level}!\nNow $${def.income*user.properties[idx].level}/hr` })
      }
      else if (cmd==='give') {
        const mention = m.message.extendedTextMessage?.contextInfo?.mentionedJid?.[0]
        const amount = parseInt(args[2] || args[1])
        if (!mention ||!amount) return sock.sendMessage(jid, { text: `Use:!give @user 100` })
        if (user.money < amount) return sock.sendMessage(jid, { text: `You don't have $${amount}` })
        const target=getUser(mention); user.money-=amount; target.money+=amount; saveDB()
        await sock.sendMessage(jid, { text: `💸 Gave $${amount} to @${mention.split('@')[0]}`, mentions:[mention] })
      }
      else if (['leaderboard','top','rich'].includes(cmd)) {
        const sorted=Object.entries(db.users).sort((a,b)=>b[1].money-a[1].money).slice(0,5)
        let txt=`🏆 *TOP RICH*\n\n`; sorted.forEach(([jid,u],i)=>txt+=`${i+1}. @${jid.split('@')[0]} - $${u.money}\n`)
        await sock.sendMessage(jid, { text:txt, mentions:sorted.map(([j])=>j) })
      }
    } catch (e) { console.log(e) }
  })
}
startBot()
