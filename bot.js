const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys')
const qrcode = require('qrcode')
const express = require('express')
const fs = require('fs')
const app = express()

let qrImage = null
let botStatus = 'Starting Empire Bot...'

// ===== PROPERTY DEFINITIONS =====
const PROPERTIES = {
  stall: { name: '🍋 Lemonade Stall', price: 500, income: 15, emoji: '🍋' },
  shop: { name: '🏪 Mini Shop', price: 2500, income: 80, emoji: '🏪' },
  cafe: { name: '☕ Cafe', price: 10000, income: 350, emoji: '☕' },
  motel: { name: '🏨 Motel', price: 40000, income: 1500, emoji: '🏨' },
  mall: { name: '🏬 Mall', price: 150000, income: 6500, emoji: '🏬' },
  tower: { name: '🏙️ Skyscraper', price: 700000, income: 30000, emoji: '🏙️' }
}

// ===== DATABASE =====
const DB_FILE = './database.json'
let db = { users: {} }

function loadDB() {
  try {
    if (fs.existsSync(DB_FILE)) db = JSON.parse(fs.readFileSync(DB_FILE))
  } catch {}
}
function saveDB() {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2))
}
loadDB()

function getUser(jid) {
  if (!db.users[jid]) {
    db.users[jid] = {
      money: 1000,
      properties: [], // {id, level, lastCollected}
      lastDaily: 0,
      name: jid.split('@')[0]
    }
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
    res.send(`<div style="text-align:center;font-family:Arial;padding:20px"><h1>SCAN QR - EMPIRE BOT</h1><img src="${qrImage}" style="width:340px;border:10px solid black"><script>setTimeout(()=>location.reload(),20000)</script></div>`)
  } else {
    res.send(`<div style="text-align:center;font-family:Arial"><h2>${botStatus}</h2><p>${new Date().toLocaleTimeString()}</p><script>setTimeout(()=>location.reload(),5000)</script></div>`)
  }
})
app.listen(process.env.PORT || 3000)

// ===== BOT LOGIC =====
async function startBot() {
  const { version } = await fetchLatestBaileysVersion()
  const { state, saveCreds } = await useMultiFileAuthState('auth_info')
  const sock = makeWASocket({ version, auth: state, browser: ["Ubuntu","Chrome","20.0.04"], printQRInTerminal: false })
  sock.ev.on('creds.update', saveCreds)
  sock.ev.on('connection.update', async (u) => {
    const { connection, lastDisconnect, qr } = u
    if (qr) qrImage = await qrcode.toDataURL(qr)
    if (connection === 'open') { qrImage = null; botStatus = '💰 EMPIRE BOT READY 24/7!' }
    if (connection === 'close') {
      const code = lastDisconnect?.error?.output?.statusCode
      if (code!== DisconnectReason.loggedOut) setTimeout(startBot, 5000)
    }
  })

  sock.ev.on('messages.upsert', async ({ messages }) => {
    const m = messages[0]
    if (!m.message || m.key.fromMe) return
    const jid = m.key.remoteJid
    const isGroup = jid.endsWith('@g.us')
    const senderJid = isGroup? m.key.participant : jid
    const text = (m.message.conversation || m.message.extendedTextMessage?.text || '').trim()
    if (!text.startsWith('!') &&!text.toLowerCase().startsWith('hi')) return

    const user = getUser(senderJid)
    const args = text.split(' ')
    const cmd = args[0].toLowerCase().replace('!','')

    try {
      // HELP
      if (['help','menu','commands'].includes(cmd) || text.toLowerCase()==='hi') {
        await sock.sendMessage(jid, { text:
`💰 *MONEY EMPIRE BOT* 💰
Start with $1000!

*💵 MONEY:*
!balance - Check money
!daily - Free $500 every 24h
!collect - Collect from properties
!leaderboard - Top rich players

*🏠 PROPERTIES:*
!shop - See properties to buy
!buy <name> - Buy (stall/shop/cafe/motel/mall/tower)
!myprops - Your properties & income
!upgrade <name> - Upgrade (x2 income) cost = price

*🤝 SOCIAL:*
!give @tag amount - Give money

Example:!buy shop
Collect every hour to get rich! 🏦`})
      }
      // BALANCE
      else if (['balance','money','bal'].includes(cmd)) {
        const pending = getTotalPending(user)
        await sock.sendMessage(jid, { text: `💳 *${user.name}*\n💰 Wallet: $${user.money}\n📦 Pending from properties: $${pending}\nUse!collect to claim!\n🏠 Properties: ${user.properties.length}` })
      }
      // DAILY
      else if (cmd==='daily') {
        const now = Date.now()
        if (now - user.lastDaily < 24*60*60*1000) {
          const left = Math.ceil((24*60*60*1000 - (now-user.lastDaily))/3600000)
          await sock.sendMessage(jid, { text: `⏰ Come back in ${left}h! Daily is every 24h` })
        } else {
          user.money += 500
          user.lastDaily = now
          saveDB()
          await sock.sendMessage(jid, { text: `✅ Daily claimed! +$500\nNew balance: $${user.money}` })
        }
      }
      // SHOP
      else if (cmd==='shop') {
        let txt = `🏪 *PROPERTY SHOP*\nYou have: $${user.money}\n\n`
        for (let id in PROPERTIES) {
          const p = PROPERTIES[id]
          txt += `${p.emoji} *${id}* - ${p.name}\n💵 Price: $${p.price} | 💸 $${p.income}/hr\nUpgrade cost: $${p.price} (+1 level)\n\n`
        }
        txt += `Buy:!buy stall`
        await sock.sendMessage(jid, { text: txt })
      }
      // BUY
      else if (cmd==='buy') {
        const id = args[1]?.toLowerCase()
        if (!PROPERTIES[id]) return sock.sendMessage(jid, { text: `❌ Invalid! Use: stall, shop, cafe, motel, mall, tower\n!shop to see` })
        const prop = PROPERTIES[id]
        if (user.money < prop.price) return sock.sendMessage(jid, { text: `❌ Need $${prop.price}, you have $${user.money}` })
        user.money -= prop.price
        user.properties.push({ id, level: 1, lastCollected: Date.now() })
        saveDB()
        await sock.sendMessage(jid, { text: `✅ Bought ${prop.name} for $${prop.price}!\nIt earns $${prop.income}/hr\nUse!collect to get money!` })
      }
      // MY PROPS
      else if (['myprops','properties','props'].includes(cmd)) {
        if (user.properties.length===0) return sock.sendMessage(jid, { text: `You own nothing!!shop to buy` })
        let txt = `🏠 *YOUR EMPIRE*\n\n`
        user.properties.forEach((p,i) => {
          const def = PROPERTIES[p.id]
          const pending = calcIncome(p)
          txt += `${i+1}. ${def.name} Lv.${p.level}\n💸 $${def.income * p.level}/hr | Pending: $${pending}\n\n`
        })
        txt += `💰 Total pending: $${getTotalPending(user)}\n!collect to claim all!`
        await sock.sendMessage(jid, { text: txt })
      }
      // COLLECT
      else if (cmd==='collect') {
        const total = getTotalPending(user)
        if (total===0) return sock.sendMessage(jid, { text: `Nothing to collect yet! Wait a bit ⏰` })
        user.properties.forEach(p => p.lastCollected = Date.now())
        user.money += total
        saveDB()
        await sock.sendMessage(jid, { text: `💰 COLLECTED $${total}!\nNew balance: $${user.money}` })
      }
      // UPGRADE
      else if (cmd==='upgrade') {
        const id = args[1]?.toLowerCase()
        if (!id) return sock.sendMessage(jid, { text: `Use:!upgrade <property name>\nEx:!upgrade shop` })
        const propIndex = user.properties.findIndex(p => p.id===id)
        if (propIndex===-1) return sock.sendMessage(jid, { text: `You don't own ${id}!` })
        const def = PROPERTIES[id]
        const cost = def.price * user.properties[propIndex].level // cost increases
        if (user.money < cost) return sock.sendMessage(jid, { text: `❌ Upgrade costs $${cost}, you have $${user.money}` })
        user.money -= cost
        user.properties[propIndex].level += 1
        saveDB()
        await sock.sendMessage(jid, { text: `⬆️ Upgraded ${def.name} to Lv.${user.properties[propIndex].level}!\nNew income: $${def.income * user.properties[propIndex].level}/hr` })
      }
      // GIVE
      else if (cmd==='give') {
        const mention = m.message.extendedTextMessage?.contextInfo?.mentionedJid?.[0] || args[1]
        const amount = parseInt(args[2] || args[1])
        if (!amount || amount<=0) return sock.sendMessage(jid, { text: `Use:!give @user 100` })
        if (user.money < amount) return sock.sendMessage(jid, { text: `You don't have $${amount}` })
        let targetJid = mention
        if (!targetJid?.includes('@s.whatsapp.net')) {
          // try to find by number
          targetJid = args[1]?.replace('@','') + '@s.whatsapp.net'
        }
        const target = getUser(targetJid)
        user.money -= amount
        target.money += amount
        saveDB()
        await sock.sendMessage(jid, { text: `💸 Gave $${amount} to @${targetJid.split('@')[0]}`, mentions: [targetJid] })
      }
      // LEADERBOARD
      else if (['leaderboard','top','rich'].includes(cmd)) {
        const sorted = Object.entries(db.users).sort((a,b) => b[1].money - a[1].money).slice(0,5)
        let txt = `🏆 *RICHEST PLAYERS*\n\n`
        sorted.forEach(([jid,u],i) => txt += `${i+1}. @${jid.split('@')[0]} - $${u.money}\n`)
        const mentions = sorted.map(([jid])=>jid)
        await sock.sendMessage(jid, { text: txt, mentions })
      }

    } catch (e) {
      console.log(e)
      await sock.sendMessage(jid, { text: `Error: ${e.message}` })
    }
  })
}

startBot()
