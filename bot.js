const express = require("express")
const QRCode = require("qrcode")
const fs = require("fs")
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require("@whiskeysockets/baileys")

const app = express()
const PORT = process.env.PORT || 3000

// DATA STORAGE
if (!fs.existsSync("./data.json")) fs.writeFileSync("./data.json", "{}")
let DATA = JSON.parse(fs.readFileSync("./data.json"))
const save = () => fs.writeFileSync("./data.json", JSON.stringify(DATA, null, 2))

// 6 SOLO POWERUPS - FINAL
const POWERUPS = {
  money: "MONEY TOTEM: Next 3 WINS pay x3. Win $29999 -> get $89997. Losses are normal, not x3",
  don: "DONTOTEM: Double or Nothing - gambles your highest win TODAY. 50% +win, 50% -win",
  debt: "DEBT TOTEM: Next 3 games you bet with quota. Win = keep cash. Lose = cash safe but quota +loss",
  allin: "ALL-IN TOTEM: Next bet is doubled. You bet $1000, game plays as $2000. Win double, lose double",
  freeze: "FREEZE TOTEM: Freezes quota for 1 day. Normally quota x1.6 each day, this stops it for 1 day",
  secondlife: "SECONDLIFE TOTEM: If you go broke ($0), auto revive with 30% of quota as cash"
}
const LIST = Object.keys(POWERUPS)

function getUser(id) {
  if (!DATA[id]) DATA[id] = {
    cash: 1000,
    quota: 5000,
    day: 1,
    lastDaily: null,
    tokenDays: 0,
    tokens: 0,
    inventory: {},
    active: {},
    highestWinToday: 0,
    double_active: false,
    double_pot: 0,
    games21: null,
    market: false
  }
  return DATA[id]
}

function checkDaily(id) {
  const u = getUser(id)
  const today = new Date().toDateString()
  if (u.lastDaily !== today) {
    u.lastDaily = today
    u.highestWinToday = 0
    for (let i = 0; i < 2; i++) {
      let p = LIST[Math.floor(Math.random() * LIST.length)]
      u.inventory[p] = (u.inventory[p] || 0) + 1
    }
    save()
    return true
  }
  return false
}

let latestQR = null
let isConnected = false

// ================= RAILWAY WEBSITE WITH QR =================
app.get("/", async (req, res) => {
  if (isConnected) {
    return res.send(`
      <html>
      <head><meta name="viewport" content="width=device-width, initial-scale=1"><title>Loan Shark Bot Linked</title></head>
      <body style="text-align:center;font-family:sans-serif;padding:40px;background:#0a0a0a;color:#fff">
        <h1 style="color:#25D366;font-size:32px">✅ WhatsApp Linked!</h1>
        <p style="font-size:18px">Loan Shark Bot is running on Railway</p>
        <div style="background:#1a1a1a;padding:20px;border-radius:12px;margin:20px auto;max-width:500px;text-align:left">
          <p><b>10 Games:</b><br>!dice !crash !slots !mines !heist !double !boxes !21 !market !rps</p>
          <p><b>Powerups:</b><br>!bal !powerups !use !trade !pay</p>
          <p><b>Powerup System:</b><br>• Daily = 2 random free powerups<br>• Every 2 days survived = 1 token<br>• 1 token = trade for any powerup you want</p>
        </div>
        <br><a href="/logout" style="color:#ff4444;text-decoration:none;border:1px solid #ff4444;padding:10px 20px;border-radius:8px">Logout / New QR</a>
      </body>
      </html>
    `)
  }
  if (!latestQR) {
    return res.send(`
      <html><body style="text-align:center;font-family:sans-serif;padding:60px;background:#0a0a0a;color:#fff">
      <h1>⏳ Starting Loan Shark Bot...</h1>
      <p>Railway is building, QR code coming in 5-10 seconds</p>
      <p style="color:#888">This page auto-refreshes</p>
      <script>setTimeout(()=>location.reload(),5000)</script>
      </body></html>
    `)
  }
  const qrImage = await QRCode.toDataURL(latestQR)
  res.send(`
    <html>
    <head><meta name="viewport" content="width=device-width, initial-scale=1"><title>Scan Loan Shark Bot</title></head>
    <body style="text-align:center;font-family:sans-serif;padding:20px;background:#0a0a0a;color:#fff">
      <h1 style="color:#25D366">📱 Scan to Link Loan Shark Bot</h1>
      <p>Loan Shark Game - 10 Games + 6 Totems</p>
      <div style="background:#fff;padding:24px;border-radius:24px;display:inline-block;margin:20px;box-shadow:0 0 30px rgba(37,211,102,0.3)">
        <img src="${qrImage}" style="width:340px;height:340px;display:block">
      </div>
      <p style="font-size:18px"><b>WhatsApp > Settings > Linked Devices > Link a Device > Scan QR</b></p>
      <p style="color:#888">QR expires in 30 seconds - page auto refreshes every 30s</p>
      <p style="color:#666;margin-top:30px">After scan, this page will show ✅ Linked!</p>
      <script>setTimeout(()=>location.reload(),30000)</script>
    </body>
    </html>
  `)
})

app.get("/logout", async (req, res) => {
  try { fs.rmSync("./auth", { recursive: true, force: true }) } catch (e) {}
  latestQR = null
  isConnected = false
  res.redirect("/")
  setTimeout(() => startBot(), 2000)
})

app.listen(PORT, () => console.log("Web server running on port " + PORT))

// ================= BOT LOGIC - FULL DETAILED =================
async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState('./auth')
  const sock = makeWASocket({ auth: state, printQRInTerminal: false })

  sock.ev.on('creds.update', saveCreds)
  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update
    if (qr) { latestQR = qr; console.log("New QR generated for website") }
    if (connection === "open") { isConnected = true; latestQR = null; console.log("✅ WhatsApp Linked! Bot running") }
    if (connection === "close") {
      isConnected = false
      const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut
      console.log("Disconnected, reconnecting:", shouldReconnect)
      if (shouldReconnect) startBot()
    }
  })

  sock.ev.on('messages.upsert', async ({ messages }) => {
    const m = messages[0]
    if (!m.message || m.key.fromMe) return
    const id = m.key.remoteJid
    const text = m.message.conversation || m.message.extendedTextMessage?.text || ""
    if (!text.startsWith("!")) return

    const args = text.trim().split(/ +/)
    const cmd = args[0].toLowerCase()
    const u = getUser(id)
    const isNewDay = checkDaily(id)
    if (isNewDay) {
      await sock.sendMessage(id, { text: `🎁 DAILY REWARD!\nYou got 2 random powerups!\n\nYour inventory: ${Object.entries(u.inventory).map(([k,v])=>`${k} x${v}`).join(", ")}\n\n!powerups to see what they do\n!bal to check cash\n\nTokens: ${u.tokens} (get 1 token every 2 days survived)` })
    }

    // BALANCE
    if (cmd == "!bal") {
      let inv = Object.entries(u.inventory).map(([k, v]) => `${k.toUpperCase()} x${v}`).join(", ") || "none"
      let active = Object.entries(u.active).map(([k, v]) => `${k.toUpperCase()}:${v}`).join(", ") || "none"
      return sock.sendMessage(id, { text: `💵 CASH: $${u.cash}\n📌 QUOTA DUE DAY ${u.day}: $${u.quota}\n📅 Day: ${u.day}\n🏆 Highest Win Today: $${u.highestWinToday}\n🎟️ Tokens: ${u.tokens} (Progress ${u.tokenDays}/2 days)\n📦 Inventory: ${inv}\n⚡ Active Totems: ${active}\n\nCommands:\n!pay <amount> - pay quota\n!powerups - list powerups\n!use <name> - use powerup\n!trade <name> - 1 token for any powerup` })
    }

    if (cmd == "!help") {
      return sock.sendMessage(id, { text: `🎰 LOAN SHARK - 10 GAMES\n\n!dice <bet> - 40% win x2\n!crash <bet> <stop> - crash game ex: !crash 1000 2.5\n!slots <bet> - slots machine\n!mines <bet> <5 picks> - ex: !mines 1000 A1 B2 C3 D4 E5\n!heist <bet> <loud/sneaky/smart> - heist\n!double <bet> - double or nothing, LOSE WHERE U AT\n!boxes <bet> <1-3> - pick a box\n!21 <bet> - blackjack\n!market <bet> <coin> - 40% x2 wait 30s\n!rps <bet> <rock/paper/scissors>\n\n!pay <amount> - pay quota (quota x1.6 each day)\n!bal - balance\n!powerups - powerups\n\nTOTEMS:\nmoney = next 3 WINS x3 (your idea)\ndon = double highest win today or lose it (your idea)\ndebt = next 3 loses go to quota not cash\nallin = next bet doubled\nfreeze = freeze quota 1 day\nsecondlife = revive at $0` })
    }

    if (cmd == "!powerups") {
      let txt = `🔋 POWERUPS - 6 SOLO TOTEMS:\n\n`
      txt += `1. MONEY TOTEM (your idea)\n${POWERUPS.money}\nEx: win $29999 -> get $89997!\nCommand: !use money\n\n`
      txt += `2. DONTOTEM (your idea)\n${POWERUPS.don}\nEx: highest win today $20000 -> 50% +$20000, 50% -$20000\nCommand: !use don\n\n`
      txt += `3. DEBT TOTEM\n${POWERUPS.debt}\nCommand: !use debt\n\n`
      txt += `4. ALL-IN TOTEM\n${POWERUPS.allin}\nCommand: !use allin\n\n`
      txt += `5. FREEZE TOTEM\n${POWERUPS.freeze}\nCommand: !use freeze\n\n`
      txt += `6. SECONDLIFE TOTEM\n${POWERUPS.secondlife}\nCommand: !use secondlife\n\n`
      txt += `YOUR INVENTORY: ${JSON.stringify(u.inventory)}\nTOKENS: ${u.tokens}\n\nDAILY: 2 random free every day\nTOKEN: survive 2 days (pay quota 2x) = 1 token\nTRADE: !trade money/don/debt/allin/freeze/secondlife = 1 token for that totem`
      return sock.sendMessage(id, { text: txt })
    }

    if (cmd == "!trade") {
      let want = args[1]?.toLowerCase()
      if (!POWERUPS[want]) return sock.sendMessage(id, { text: `Invalid totem name.\nUse: !trade money / don / debt / allin / freeze / secondlife\n\nYou have ${u.tokens} tokens` })
      if (u.tokens < 1) return sock.sendMessage(id, { text: `❌ No tokens!\nYou need to survive 2 days (pay quota 2 times)\nProgress: ${u.tokenDays}/2 days\nTokens: ${u.tokens}` })
      u.tokens--
      u.inventory[want] = (u.inventory[want] || 0) + 1
      save()
      return sock.sendMessage(id, { text: `✅ TRADED!\n1 token -> ${want.toUpperCase()} TOTEM\n\nYou now have ${want} x${u.inventory[want]}\nTokens left: ${u.tokens}\n\n!use ${want} to activate` })
    }

    if (cmd == "!use") {
      let p = args[1]?.toLowerCase()
      if (!u.inventory[p] || u.inventory[p] <= 0) return sock.sendMessage(id, { text: `❌ You don't have ${p}\n\nYour inventory: ${JSON.stringify(u.inventory)}\n!powerups to see list\n!trade ${p} to buy with token` })

      u.inventory[p]--

      if (p == "money") {
        u.active.money = 3
        save()
        return sock.sendMessage(id, { text: `💰💰💰 MONEY TOTEM ACTIVATED!!!\n\nNext 3 WINS will pay TRIPLE!\n• Win $1000 -> get $3000\n• Win $29999 -> get $89997 (your example!)\n• Losses are NORMAL, not x3\n\nUses left: 3 wins\nGood luck! Bet big!` })
      }
      if (p == "debt") {
        u.active.debt = 3
        save()
        return sock.sendMessage(id, { text: `💳 DEBT TOTEM ACTIVATED!\n\nNext 3 games:\n✅ Win = you keep all cash\n❌ Lose = cash is SAFE, but quota goes UP by loss amount\n\nEx: bet $10000, lose -> still have cash, but quota $5000 -> $15000\n\nUses left: 3 games` })
      }
      if (p == "allin") {
        u.active.allin = true
        save()
        return sock.sendMessage(id, { text: `🔥🔥🔥 ALL-IN TOTEM ACTIVATED!\n\nNext bet will be DOUBLED by George!\n• You bet $1000 -> game plays as $2000\n• Win = win $2000\n• Lose = lose $2000\n\nOne time use!` })
      }
      if (p == "freeze") {
        u.active.freeze = true
        save()
        return sock.sendMessage(id, { text: `🧊🧊🧊 FREEZE TOTEM ACTIVATED!\n\nNext !pay will NOT increase quota!\nNormally quota x1.6 each day:\nDay 1 $5000 -> Day 2 $8000 -> Day 3 $12800\n\nWith freeze: quota stays same for 1 day!\nUse when quota is huge!` })
      }
      if (p == "secondlife") {
        u.active.secondlife = true
        save()
        return sock.sendMessage(id, { text: `❤️ SECONDLIFE TOTEM ARMED!\n\nIf you go broke ($0), you will auto-revive with 30% of your quota as cash!\n\nEx: quota $10000, go broke -> revive $3000\n\nOne-time passive, stays active until triggered` })
      }
      if (p == "don") {
        if (u.highestWinToday <= 0) {
          u.inventory[p]++
          save()
          return sock.sendMessage(id, { text: `❌ No win today yet!\n\nDONTOTEM needs a win today to double.\nWin something first, then use !use don\n\nYour highest win today: $${u.highestWinToday}` })
        }
        let betAmount = u.highestWinToday
        if (Math.random() < 0.5) {
          let finalWin = betAmount
          let moneyActive = !!u.active.money
          if (u.active.money) {
            finalWin *= 3
            u.active.money--
            if (u.active.money <= 0) delete u.active.money
          }
          u.cash += finalWin
          if (finalWin > u.highestWinToday) u.highestWinToday = finalWin
          save()
          return sock.sendMessage(id, { text: `🎉🎉🎉 DONTOTEM WIN!!!\n\nCOINFLIP WIN! 50%!\nYour highest win today $${betAmount} DOUBLED!\n\n+ $${finalWin} ${moneyActive ? "(MONEY TOTEM x3 APPLIED!)" : ""}\n\nCash now: $${u.cash}\nHighest win today: $${u.highestWinToday}` })
        } else {
          if (u.active.debt) {
            u.quota += betAmount
            u.active.debt--
            if (u.active.debt <= 0) delete u.active.debt
            save()
            return sock.sendMessage(id, { text: `💀 DONTOTEM LOSE! Coinflip failed!\n\nBUT DEBT TOTEM SAVED YOUR CASH!\nLoss $${betAmount} went to quota, not cash!\n\nQuota now: $${u.quota}\nCash still: $${u.cash}\nDebt uses left: ${u.active.debt || 0}` })
          }
          u.cash -= betAmount
          if (u.cash <= 0 && u.active.secondlife) {
            let revive = Math.floor(u.quota * 0.3)
            u.cash = revive
            delete u.active.secondlife
            save()
            return sock.sendMessage(id, { text: `💀 DONTOTEM LOSE! -$${betAmount}\n\nBUT ❤️ SECONDLIFE TRIGGERED!\nRevived with $${revive} (30% of quota)\n\nCash: $${u.cash}` })
          }
          save()
          return sock.sendMessage(id, { text: `💀 DONTOTEM LOSE! Coinflip failed!\n\nLost -$${betAmount} (your highest win today)\n\nCash now: $${u.cash}` })
        }
      }
    }

    if (cmd == "!pay") {
      let amt = parseInt(args[1])
      if (isNaN(amt)) return sock.sendMessage(id, { text: `!pay <amount>\nNeed to pay quota $${u.quota}\nCash $${u.cash}` })
      if (amt < u.quota) return sock.sendMessage(id, { text: `George: You think $${amt} is enough? I need $${u.quota}!\nCash: $${u.cash}` })
      if (amt > u.cash) return sock.sendMessage(id, { text: `Broke! You have $${u.cash} but need $${u.quota}\nGo gamble! !dice !slots !crash` })
      u.cash -= amt
      u.tokenDays++
      if (u.tokenDays >= 2) {
        u.tokens++
        u.tokenDays = 0
        await sock.sendMessage(id, { text: `🎟️🎟️🎟️ TOKEN EARNED!!!\n\nYou survived 2 days! (paid quota 2 times)\n\nTotal tokens: ${u.tokens}\nTrade with: !trade money / don / debt / allin / freeze / secondlife\n\n1 token = any powerup you want!` })
      }
      let freezeActive = u.active.freeze
      u.day++
      let leftover = u.cash
      if (freezeActive) {
        delete u.active.freeze
        await sock.sendMessage(id, { text: `🧊 FREEZE TOTEM USED!\n\nQuota stays $${u.quota} instead of going to $${Math.floor(u.quota * 1.6)}!\nYou saved $${Math.floor(u.quota * 1.6) - u.quota}!` })
      } else {
        u.quota = Math.floor(u.quota * 1.6)
      }
      u.cash = leftover
      if (u.cash < 0) u.cash = 500
      save()
      return sock.sendMessage(id, { text: `✅ PAID DAY ${u.day - 1}!\n\nPaid: $${amt}\nCash left: $${u.cash}\n📅 Now Day ${u.day}\n📌 NEW Quota: $${u.quota} ${freezeActive ? "(FROZEN - no x1.6!)" : "(x1.6 increased!)"}\n🎟️ Token progress: ${u.tokenDays}/2 days\n\nKeep gambling to pay next quota!` })
    }

    // HELPERS - TRIPLE CHECKED BUG FIX
    function applyWin(realBet, profit) {
      let finalProfit = profit
      if (u.active.money) {
        finalProfit = profit * 3
        u.active.money--
        if (u.active.money <= 0) delete u.active.money
      }
      u.cash += finalProfit
      if (finalProfit > u.highestWinToday) u.highestWinToday = finalProfit
      return finalProfit
    }

    function applyLoss(realBet) {
      if (u.active.debt) {
        u.quota += realBet
        u.active.debt--
        if (u.active.debt <= 0) delete u.active.debt
        return `💳 DEBT TOTEM! Cash safe! But quota +$${realBet} -> $${u.quota} (uses left ${u.active.debt || 0})`
      } else {
        u.cash -= realBet
        if (u.cash <= 0 && u.active.secondlife) {
          let revive = Math.floor(u.quota * 0.3)
          u.cash = revive
          delete u.active.secondlife
          return `LOSE -$${realBet} BUT ❤️ SECONDLIFE REVIVED $${revive}! (30% of quota)`
        }
        return `LOSE -$${realBet}`
      }
    }

    // 1. DICE - 40% WIN
    if (cmd == "!dice") {
      let bet = parseInt(args[1])
      if (isNaN(bet) || bet <= 0) return sock.sendMessage(id, { text: `!dice <bet>\nEx: !dice 1000\n40% chance win x2` })
      if (bet > u.cash) return sock.sendMessage(id, { text: `Broke! Cash $${u.cash}` })
      let realBet = bet
      if (u.active.allin) { realBet = bet * 2; delete u.active.allin; await sock.sendMessage(id, { text: `🔥 ALL-IN! $${bet} plays as $${realBet} DOUBLE!` }) }
      if (Math.random() < 0.40) {
        let p = applyWin(realBet, realBet)
        save()
        return sock.sendMessage(id, { text: `🎲 DICE WIN!!!\n+ $${p} ${u.active.money !== undefined ? `(MONEY TOTEM active ${u.active.money} wins left)` : ""}\nCash: $${u.cash}\nBest today: $${u.highestWinToday}` })
      } else {
        let msg = applyLoss(realBet)
        save()
        return sock.sendMessage(id, { text: `🎲 DICE LOSE!\n${msg}\nCash: $${u.cash}` })
      }
    }

    // 2. CRASH
    if (cmd == "!crash") {
      let bet = parseInt(args[1]); let stop = parseFloat(args[2])
      if (isNaN(bet) || isNaN(stop)) return sock.sendMessage(id, { text: `!crash <bet> <stop>\nEx: !crash 1000 2.5 = cash out at 2.5x` })
      if (bet > u.cash) return sock.sendMessage(id, { text: `Broke! $${u.cash}` })
      let realBet = bet
      if (u.active.allin) { realBet = bet * 2; delete u.active.allin; await sock.sendMessage(id, { text: `🔥 ALL-IN! $${bet} -> $${realBet}` }) }
      let crash_pt = Math.random() < 0.6 ? Math.random() * 1.2 + 1 : Math.random() * 8 + 1.05
      if (crash_pt >= stop) {
        let profit = Math.floor(realBet * (stop - 1))
        let p = applyWin(realBet, profit)
        save()
        return sock.sendMessage(id, { text: `📈 CRASH WIN!\nCrashed at ${crash_pt.toFixed(2)}x, you cashed ${stop}x\n+ $${p}\nCash $${u.cash}` })
      } else {
        let msg = applyLoss(realBet)
        save()
        return sock.sendMessage(id, { text: `📉 CRASH LOSE!\nCrashed at ${crash_pt.toFixed(2)}x before your ${stop}x\n${msg}\nCash $${u.cash}` })
      }
    }

    // 3. SLOTS - FULL
    if (cmd == "!slots") {
      let bet = parseInt(args[1])
      if (isNaN(bet)) return sock.sendMessage(id, { text: `!slots <bet>\nEx: !slots 1000` })
      if (bet > u.cash) return sock.sendMessage(id, { text: `Broke $${u.cash}` })
      let realBet = bet
      if (u.active.allin) { realBet = bet * 2; delete u.active.allin; await sock.sendMessage(id, { text: `🔥 ALL-IN $${bet} -> $${realBet}` }) }
      let r = Math.random()
      if (r < 0.60) { let msg = applyLoss(realBet); save(); return sock.sendMessage(id, { text: `🎰 [💀 | 🍋 | 🍒]\nLOSE!\n${msg}\nCash $${u.cash}` }) }
      else if (r < 0.90) { let p = applyWin(realBet, Math.floor(realBet * 0.5)); save(); return sock.sendMessage(id, { text: `🎰 [🍒 | 🍒 | 💀]\nSMALL WIN! x1.5\n+ $${p}\nCash $${u.cash}` }) }
      else if (r < 0.99) { let p = applyWin(realBet, realBet * 3); save(); return sock.sendMessage(id, { text: `🎰 [💰 | 💰 | 💰]\nBIG WIN! x4\n+ $${p}\nCash $${u.cash}` }) }
      else { let p = applyWin(realBet, realBet * 14); save(); return sock.sendMessage(id, { text: `🎰 [GEORGE | GEORGE | GEORGE]\nMEGA JACKPOT! x15!!!\n+ $${p}!!!\nCash $${u.cash}` }) }
    }

    // 4. MINES - FULL
    if (cmd == "!mines") {
      let bet = parseInt(args[1]); let picks = args.slice(2)
      if (picks.length != 5 || isNaN(bet)) return sock.sendMessage(id, { text: `!mines <bet> <5 picks>\nEx: !mines 1000 A1 B2 C3 D4 E5\nBoard 5x5 A-E 1-5, 5 bombs hidden` })
      if (bet > u.cash) return sock.sendMessage(id, { text: `Broke` })
      let realBet = bet
      if (u.active.allin) { realBet = bet * 2; delete u.active.allin; await sock.sendMessage(id, { text: `🔥 ALL-IN $${bet} -> $${realBet}` }) }
      let bombs = new Set(); while (bombs.size < 5) { bombs.add(`${String.fromCharCode(65 + Math.floor(Math.random() * 5))}${Math.floor(Math.random() * 5) + 1}`) }
      let hit = [...bombs].some(b => picks.includes(b))
      if (hit) { let msg = applyLoss(realBet); save(); return sock.sendMessage(id, { text: `💣 MINES BOOM!\nYour picks: ${picks.join(" ")}\nBombs were: ${[...bombs].join(" ")}\n\n${msg}\nCash $${u.cash}` }) }
      else { let p = applyWin(realBet, realBet); save(); return sock.sendMessage(id, { text: `✅ MINES SAFE!\nYour picks: ${picks.join(" ")}\nBombs were: ${[...bombs].join(" ")}\n\nWIN +$${p} x2\nCash $${u.cash}` }) }
    }

    // 5. HEIST - FULL
    if (cmd == "!heist") {
      let bet = parseInt(args[1]); let style = args[2]?.toLowerCase()
      if (isNaN(bet) || !style) return sock.sendMessage(id, { text: `!heist <bet> <loud/sneaky/smart>\nloud 45% x2.2\nsneaky 40% x2.5\nsmart 35% x3` })
      if (bet > u.cash) return sock.sendMessage(id, { text: `Broke` })
      let realBet = bet
      if (u.active.allin) { realBet = bet * 2; delete u.active.allin; await sock.sendMessage(id, { text: `🔥 ALL-IN $${bet} -> $${realBet}` }) }
      let map = { loud: [0.45, 2.2], sneaky: [0.40, 2.5], smart: [0.35, 3] }
      if (!map[style]) return sock.sendMessage(id, { text: `Pick loud sneaky smart` })
      let [chance, mult] = map[style]
      if (Math.random() < chance) { let p = applyWin(realBet, Math.floor(realBet * (mult - 1))); save(); return sock.sendMessage(id, { text: `💼 HEIST ${style.toUpperCase()} SUCCESS!\nWIN x${mult} +$${p}\nCash $${u.cash}` }) }
      else { let msg = applyLoss(realBet); save(); return sock.sendMessage(id, { text: `🚨 HEIST ${style.toUpperCase()} FAILED!\n${msg}\nCash $${u.cash}` }) }
    }

    // 6. DOUBLE - LOSE WHERE U AT - FULL
    if (cmd == "!double") {
      let bet = parseInt(args[1])
      if (!u.double_active) {
        if (!bet || isNaN(bet) || bet > u.cash) return sock.sendMessage(id, { text: `!double <bet> to start\nThen !double again to double pot\nOr !stop to cash out\nLOSE WHERE U AT - lose pot all gone!` })
        u.double_active = true; u.double_pot = bet; u.cash -= bet; save()
        return sock.sendMessage(id, { text: `🎯 DOUBLE OR NOTHING STARTED!\n\nPot: $${bet}\nYou put: $${bet}\n\n!double again = try for $${bet * 2} (45% win)\n!stop = cash out $${bet}\n\nIf you lose, pot GONE! LOSE WHERE U AT!` })
      } else {
        if (Math.random() < 0.45) {
          u.double_pot *= 2
          await sock.sendMessage(id, { text: `✅ DOUBLE WIN! Pot now $${u.double_pot}!\n\n!double again = try $${u.double_pot * 2}\n!stop = cash out $${u.double_pot}` })
        } else {
          let lost = u.double_pot
          u.double_active = false; u.double_pot = 0
          if (u.active.debt) { u.quota += lost; u.active.debt--; if (u.active.debt <= 0) delete u.active.debt; save(); return sock.sendMessage(id, { text: `💀 DOUBLE LOSE $${lost} where u at GONE!\nBUT DEBT TOTEM: quota +$${lost} instead of cash loss!\nQuota $${u.quota}\nCash $${u.cash}` }) }
          if (u.cash <= 0 && u.active.secondlife) { let revive = Math.floor(u.quota * 0.3); u.cash = revive; delete u.active.secondlife; save(); return sock.sendMessage(id, { text: `💀 DOUBLE LOSE $${lost} where u at GONE!\nBUT ❤️ SECONDLIFE $${revive}\nCash $${u.cash}` }) }
          save()
          return sock.sendMessage(id, { text: `💀💀💀 DOUBLE LOSE $${lost} where u at!\n\nPot GONE! All lost!\nCash $${u.cash}` })
        }
        save()
      }
    }
    if (cmd == "!stop") {
      if (!u.double_active) return sock.sendMessage(id, { text: `No active double game\n!double <bet> to start` })
      let pot = u.double_pot
      let moneyMsg = ""
      if (u.active.money) { let before = pot; pot *= 3; moneyMsg = `💰 MONEY TOTEM x3! $${before} -> $${pot}!`; u.active.money--; if (u.active.money <= 0) delete u.active.money }
      u.cash += pot; u.double_active = false; u.double_pot = 0; save()
      return sock.sendMessage(id, { text: `💰 STOPPED! CASHED OUT!\n\n${moneyMsg}\nCashed: $${pot}\nCash now: $${u.cash}\nBest today: $${u.highestWinToday}` })
    }

    // 7. BOXES - FULL
    if (cmd == "!boxes") {
      let bet = parseInt(args[1]); let choice = parseInt(args[2])
      if (isNaN(bet) || isNaN(choice)) return sock.sendMessage(id, { text: `!boxes <bet> <1-3>\nEx: !boxes 1000 2\nPick box 1-3, 33% win x2.2` })
      if (bet > u.cash) return sock.sendMessage(id, { text: `Broke` })
      let realBet = bet
      if (u.active.allin) { realBet = bet * 2; delete u.active.allin; await sock.sendMessage(id, { text: `🔥 ALL-IN $${bet} -> $${realBet}` }) }
      let winBox = Math.floor(Math.random() * 3) + 1
      if (choice == winBox) { let p = applyWin(realBet, Math.floor(realBet * 1.2)); save(); return sock.sendMessage(id, { text: `📦 BOX ${choice} WINNER!!!\nYou picked ${choice}, winner was ${winBox}!\n+ $${p} x2.2\nCash $${u.cash}` }) }
      else { let msg = applyLoss(realBet); save(); return sock.sendMessage(id, { text: `📦 BOX ${choice} EMPTY!\nYou picked ${choice}, winner was ${winBox}\n${msg}\nCash $${u.cash}` }) }
    }

    // 8. BLACKJACK 21 - FULL
    if (cmd == "!21") {
      let bet = parseInt(args[1])
      if (isNaN(bet)) return sock.sendMessage(id, { text: `!21 <bet>\nEx: !21 1000\nBlackjack! Get 21!` })
      if (bet > u.cash) return sock.sendMessage(id, { text: `Broke` })
      let realBet = bet
      if (u.active.allin) { realBet = bet * 2; delete u.active.allin; await sock.sendMessage(id, { text: `🔥 ALL-IN $${bet} -> $${realBet}` }) }
      let p = [Math.floor(Math.random() * 9) + 2, Math.floor(Math.random() * 9) + 2]
      u.games21 = { bet: realBet, p, d: [Math.floor(Math.random() * 9) + 2, Math.floor(Math.random() * 9) + 2] }
      save()
      return sock.sendMessage(id, { text: `🃏 BLACKJACK!\n\nYou: ${p.join(" + ")} = ${p[0] + p[1]}\nDealer: ${u.games21.d[0]} + ?\n\n!draw - hit\n!stay21 - stand\nBet: $${realBet}` })
    }
    if (cmd == "!draw") {
      if (!u.games21) return sock.sendMessage(id, { text: `No active 21 game\n!21 <bet> to start` })
      u.games21.p.push(Math.floor(Math.random() * 9) + 2)
      let s = u.games21.p.reduce((a, b) => a + b, 0)
      if (s > 21) { let msg = applyLoss(u.games21.bet); u.games21 = null; save(); return sock.sendMessage(id, { text: `💥 BUST! ${s} over 21!\n${msg}\nCash $${u.cash}` }) }
      else if (s == 21) { let p = applyWin(u.games21.bet, Math.floor(u.games21.bet * 1.5)); u.games21 = null; save(); return sock.sendMessage(id, { text: `🎉 21!!! BLACKJACK!\n+ $${p} x2.5!\nCash $${u.cash}` }) }
      else return sock.sendMessage(id, { text: `🃏 You: ${u.games21.p.join(" + ")} = ${s}\nDealer: ${u.games21.d[0]} + ?\n!draw !stay21` })
    }
    if (cmd == "!stay21") {
      if (!u.games21) return sock.sendMessage(id, { text: `No active game` })
      let ds = u.games21.d.reduce((a, b) => a + b, 0); while (ds < 17) { u.games21.d.push(Math.floor(Math.random() * 9) + 2); ds = u.games21.d.reduce((a, b) => a + b, 0) }
      let ps = u.games21.p.reduce((a, b) => a + b, 0)
      if (ds > 21 || ps > ds) { let p = applyWin(u.games21.bet, u.games21.bet); u.games21 = null; save(); return sock.sendMessage(id, { text: `✅ WIN! You ${ps} vs Dealer ${ds}\n+ $${p}\nCash $${u.cash}` }) }
      else if (ps == ds) { u.games21 = null; save(); return sock.sendMessage(id, { text: `🤝 PUSH! Both ${ps}\nNo win no loss\nCash $${u.cash}` }) }
      else { let msg = applyLoss(u.games21.bet); u.games21 = null; save(); return sock.sendMessage(id, { text: `❌ LOSE! You ${ps} vs Dealer ${ds}\n${msg}\nCash $${u.cash}` }) }
    }

    // 9. MARKET - 40% x2 - FULL
    if (cmd == "!market") {
      let bet = parseInt(args[1])
      if (isNaN(bet)) return sock.sendMessage(id, { text: `!market <bet> <coin>\nEx: !market 1000 bitcoin\n40% win x2, 60% lose all, wait 30s` })
      if (bet > u.cash || u.market) return sock.sendMessage(id, { text: bet > u.cash ? `Broke` : `Already in market, wait 30s` })
      let realBet = bet
      if (u.active.allin) { realBet = bet * 2; delete u.active.allin; await sock.sendMessage(id, { text: `🔥 ALL-IN $${bet} -> $${realBet}` }) }
      u.cash -= realBet; u.market = true; save()
      await sock.sendMessage(id, { text: `📊 MARKET BOUGHT!\n\nCoin: ${args[2] || "coin"} $${realBet}\nWaiting 30 seconds...\n\n40% MOON x2\n60% CRASH lose all` })
      setTimeout(async () => {
        let uu = getUser(id); uu.market = false
        if (Math.random() < 0.40) {
          let profit = realBet
          let moneyUsed = !!uu.active.money
          if (uu.active.money) { profit *= 3; uu.active.money--; if (uu.active.money <= 0) delete uu.active.money }
          uu.cash += realBet * 2
          if (profit > uu.highestWinToday) uu.highestWinToday = profit
          save()
          await sock.sendMessage(id, { text: `🚀 MARKET MOON!!!\n\n+ $${realBet} x2 ${moneyUsed ? "(x3 MONEY TOTEM!)" : ""}\nTotal cashout $${realBet * 2}\nCash $${uu.cash}` })
        } else {
          if (uu.active.debt) { uu.quota += realBet; uu.active.debt--; if (uu.active.debt <= 0) delete uu.active.debt; save(); await sock.sendMessage(id, { text: `📉 MARKET CRASH -$${realBet}\nBUT DEBT TOTEM! quota +$${realBet}\nQuota $${uu.quota}\nCash $${uu.cash}` }) }
          else {
            if (uu.cash <= 0 && uu.active.secondlife) { let rev = Math.floor(uu.quota * 0.3); uu.cash = rev; delete uu.active.secondlife; save(); await sock.sendMessage(id, { text: `📉 CRASH -$${realBet} BUT ❤️ SECONDLIFE REVIVE $${rev}` }) }
            else { save(); await sock.sendMessage(id, { text: `📉 MARKET CRASH! -$${realBet} GONE!\nCash $${uu.cash}` }) }
          }
        }
      }, 30000)
    }

    // 10. RPS - FULL
    if (cmd == "!rps") {
      let bet = parseInt(args[1]); let move = args[2]?.toLowerCase()
      if (isNaN(bet) || !move) return sock.sendMessage(id, { text: `!rps <bet> <rock/paper/scissors>\nEx: !rps 1000 rock\nWin x1.8` })
      if (!["rock", "paper", "scissors"].includes(move)) return sock.sendMessage(id, { text: `Pick rock paper scissors` })
      if (bet > u.cash) return sock.sendMessage(id, { text: `Broke $${u.cash}` })
      let realBet = bet
      if (u.active.allin) { realBet = bet * 2; delete u.active.allin; await sock.sendMessage(id, { text: `🔥 ALL-IN $${bet} -> $${realBet}` }) }
      let botMove = ['rock', 'paper', 'scissors'][Math.floor(Math.random() * 3)]
      let wins = { rock: 'scissors', scissors: 'paper', paper: 'rock' }
      if (move == botMove) return sock.sendMessage(id, { text: `🤝 TIE! Both ${move}\nNo loss\nCash $${u.cash}` })
      else if (wins[move] == botMove) { let p = applyWin(realBet, Math.floor(realBet * 0.8)); save(); return sock.sendMessage(id, { text: `✊ YOU WIN! ${move} beats ${botMove}\n+ $${p} x1.8\nCash $${u.cash}` }) }
      else { let msg = applyLoss(realBet); save(); return sock.sendMessage(id, { text: `✊ YOU LOSE! ${botMove} beats ${move}\n${msg}\nCash $${u.cash}` }) }
    }
  })
}
startBot()
