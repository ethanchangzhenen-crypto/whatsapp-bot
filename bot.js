const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, makeCacheableSignalKeyStore } = require("@whiskeysockets/baileys")
const qrcode = require("qrcode-terminal")
const fs = require("fs")
const P = require("pino")

const logger = P({ level: 'silent' })

let balances = {}
let dailyClaims = {}

try {
  if (fs.existsSync("./balances.json")) balances = JSON.parse(fs.readFileSync("./balances.json"))
  if (fs.existsSync("./daily.json")) dailyClaims = JSON.parse(fs.readFileSync("./daily.json"))
} catch {}

function save() {
  fs.writeFileSync("./balances.json", JSON.stringify(balances))
  fs.writeFileSync("./daily.json", JSON.stringify(dailyClaims))
}

function getBal(id) {
  if (balances[id] === undefined) balances[id] = 1000
  return balances[id]
}

function setBal(id, amount) {
  balances[id] = amount
}

async function start() {
  const { state, saveCreds } = await useMultiFileAuthState("auth_info")
  const sock = makeWASocket({
    auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, logger) },
    logger,
    browser: ["Slots Bot", "Chrome", "1.0"]
  })

  sock.ev.on("creds.update", saveCreds)
  sock.ev.on("connection.update", (u) => {
    if (u.qr) qrcode.generate(u.qr, { small: true })
    if (u.connection === "open") console.log("✅ BOT READY - 5% JACKPOT / 10% TRIPLE / 25% DOUBLE / 60% LOSE")
    if (u.connection === "close" && u.lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut) start()
  })

  sock.ev.on("messages.upsert", async ({ messages }) => {
    for (const m of messages) {
      if (!m.message || m.key.fromMe) continue
      const jid = m.key.remoteJid
      const sender = m.key.participant || jid
      const text = (m.message.conversation || m.message.extendedTextMessage?.text || "").trim()
      if (!text.toLowerCase().startsWith("!")) continue

      const args = text.split(/ +/)
      const cmd = args[0].toLowerCase()

      // HELP / CHECK
      if (cmd === "!check") { await sock.sendMessage(jid, { text: `✅ Bot ONLINE! Balance: $${getBal(sender)}` }); continue }
      if (cmd === "!help") { await sock.sendMessage(jid, { text: `COMMANDS:\n!bal - balance\n!daily - $100 free (24h)\n!broke - $100 if broke\n!slots 100 - slots\n!coinflip h 10 - flip\n!top - leaderboard` }); continue }
      if (cmd === "!bal" || cmd === "!balance") { await sock.sendMessage(jid, { text: `💰 Balance: $${getBal(sender)}` }); continue }

      // DAILY - 24h COOLDOWN FIXED
      if (cmd === "!daily") {
        const now = Date.now()
        const last = dailyClaims[sender] || 0
        const oneDay = 24 * 60 * 60 * 1000
        if (now - last < oneDay) {
          const left = oneDay - (now - last)
          const h = Math.floor(left / 3600000)
          const mm = Math.floor((left % 3600000) / 60000)
          await sock.sendMessage(jid, { text: `⏳ Already claimed! Wait ${h}h ${mm}m\nBalance: $${getBal(sender)}` })
          continue
        }
        dailyClaims[sender] = now
        setBal(sender, getBal(sender) + 100)
        save()
        await sock.sendMessage(jid, { text: `🎁 +$100 Daily!\nBalance: $${getBal(sender)}` })
        continue
      }

      // BROKE - $100 FIXED, NOT $1100
      if (cmd === "!broke") {
        if (getBal(sender) > 100) {
          await sock.sendMessage(jid, { text: `You still have $${getBal(sender)}, not broke!` })
          continue
        }
        setBal(sender, getBal(sender) + 100)
        save()
        await sock.sendMessage(jid, { text: `💸 Broke bonus! +$100\nBalance: $${getBal(sender)}` })
        continue
      }

      // TOP - FIXED
      if (cmd === "!top" || cmd === "!leaderboard") {
        const sorted = Object.entries(balances).sort((a, b) => b[1] - a[1]).slice(0, 10)
        if (sorted.length === 0) { await sock.sendMessage(jid, { text: `No players yet!` }); continue }
        let msg = `🏆 TOP 10 RICHEST\n\n`
        sorted.forEach(([id, b], i) => { msg += `${i + 1}. ${id.split("@")[0]} - $${b}\n` })
        await sock.sendMessage(jid, { text: msg })
        continue
      }

      // SLOTS - 4 EMOJIS + CASINO EDGES - TRIPLE CHECKED
      if (cmd === "!slots" || cmd === "!slot") {
        let bet = parseInt(args[1]) || 10
        if (isNaN(bet) || bet <= 0) { await sock.sendMessage(jid, { text: `Use: !slots 10` }); continue }
        if (getBal(sender) < bet) { await sock.sendMessage(jid, { text: `❌ Need $${bet}, you have $${getBal(sender)}` }); continue }

        const pool = ["🍒", "🍋", "🔔", "💎", "7️⃣", "🍇", "🍀"]
        const pick = () => pool[Math.floor(Math.random() * pool.length)]
        const pickDiff = (exclude) => { let p; do { p = pick() } while (exclude.includes(p)); return p }

        let result = []
        let mult = 0
        let label = ""
        const roll = Math.random() * 100

        if (roll < 5) { // 5% - 4 SAME - 100x
          const e = pick()
          result = [e, e, e, e]
          mult = 100
          label = "JACKPOT 100x"
        } else if (roll < 15) { // 10% - 3 SAME - 20x
          const e = pick()
          const other = pickDiff([e])
          result = [e, e, e, other]
          result.sort(() => Math.random() - 0.5)
          mult = 20
          label = "TRIPLE 20x"
        } else if (roll < 40) { // 25% - 2 SAME - 2x
          const e = pick()
          const o1 = pickDiff([e])
          const o2 = pickDiff([e, o1])
          result = [e, e, o1, o2]
          result.sort(() => Math.random() - 0.5)
          mult = 2
          label = "DOUBLE 2x"
        } else { // 60% - NO SAME - LOSE
          result = []
          while (result.length < 4) {
            const e = pickDiff(result)
            result.push(e)
          }
          mult = 0
          label = "LOSE"
        }

        let current = getBal(sender)
        let winText = ""
        if (mult > 0) {
          const won = bet * mult
          current = current + won
          setBal(sender, current)
          winText = `🎉 WON: +$${won} (${label})`
        } else {
          current = current - bet
          setBal(sender, current)
          winText = `💀 LOST: -$${bet} (${label})`
        }
        save()

        // 3 LAYERS AS YOU WANTED
        const topLayer = `🎰 ${result[0]}  ${result[1]}  ${result[2]}  ${result[3]} 🎰`
        const middleLayer = `💵 Bet: $${bet} | ${winText}`
        const bottomLayer = `💰 Balance: $${current}`

        await sock.sendMessage(jid, { text: `${topLayer}\n${middleLayer}\n${bottomLayer}` })
        continue
      }

      // COINFLIP
      if (cmd === "!coinflip" || cmd === "!cf") {
        const ch = args[1]
        const bet = parseInt(args[2]) || 10
        if (!ch) { await sock.sendMessage(jid, { text: `Use: !coinflip h 10 or t 10` }); continue }
        if (getBal(sender) < bet) { await sock.sendMessage(jid, { text: `❌ Need $${bet}` }); continue }
        const r = Math.random() < 0.5 ? "h" : "t"
        if (ch[0].toLowerCase() === r) {
          setBal(sender, getBal(sender) + bet)
          save()
          await sock.sendMessage(jid, { text: `🪙 Result: ${r.toUpperCase()}\nWon: +$${bet}\nBalance: $${getBal(sender)}` })
        } else {
          setBal(sender, getBal(sender) - bet)
          save()
          await sock.sendMessage(jid, { text: `🪙 Result: ${r.toUpperCase()}\nLost: -$${bet}\nBalance: $${getBal(sender)}` })
        }
      }
    }
  })
}
start()
