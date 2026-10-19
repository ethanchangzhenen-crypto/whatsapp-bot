// GAMBLING BOT V2 FINAL - Clean Checked
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys')
const express = require('express')
const qrcode = require('qrcode')

let users = {}
let lastQR = null
let isConnected = false
let settings = { paused: false }

let stocks = {
  BTC: { price: 500, emoji: '₿' },
  ETH: { price: 200, emoji: '♦' },
  DOGE: { price: 50, emoji: '🐶' },
  PEPE: { price: 10, emoji: '🐸' }
}

function getUser(id) {
  if (!users[id]) {
    users[id] = {
      gMoney: 10000,
      daily: 0,
      mines: null,
      double: null,
      stocks: { BTC: 0, ETH: 0, DOGE: 0, PEPE: 0 }
    }
  }
  return users[id]
}

function isAdmin() { return true }

function renderMinesGrid(mines) {
  let grid = ''
  for (let i = 1; i <= 25; i++) {
    if (mines.bombs.includes(i) && mines.revealed.includes(i)) grid += '🟥'
    else if (mines.revealed.includes(i)) grid += '🟩'
    else grid += '⬜'
    if (i % 5 === 0) grid += '\n'
  }
  return grid
}

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState('auth')
  const sock = makeWASocket({ auth: state })
  sock.ev.on('creds.update', saveCreds)
  sock.ev.on('connection.update', u => {
    if (u.qr) lastQR = u.qr
    if (u.connection === 'open') { isConnected = true; lastQR = null; console.log('Connected') }
    if (u.connection === 'close' && u.lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut) startBot()
  })

  // Stocks move every 8 seconds
  setInterval(() => {
    for (let k in stocks) {
      let change = (Math.random() - 0.5) * (k === 'BTC' ? 30 : k === 'ETH' ? 15 : k === 'DOGE' ? 10 : 5)
      stocks[k].price = Math.max(1, Math.floor(stocks[k].price + change))
    }
  }, 8000)

  sock.ev.on('messages.upsert', async ({ messages }) => {
    const msg = messages[0]
    if (!msg.message) return
    const jid = msg.key.remoteJid
    const sender = msg.key.participant || jid
    const text = msg.message.conversation || msg.message.extendedTextMessage?.text || ''
    const low = text.toLowerCase().trim()
    const user = getUser(sender)

    if (isAdmin(sender)) {
      if (low === '!on') { settings.paused = false; await sock.sendMessage(jid, { text: '▶️ GAMBLING V2 ON' }); return }
      if (low === '!off') { settings.paused = true; await sock.sendMessage(jid, { text: '⏸️ OFF' }); return }
    }
    if (settings.paused) return

    if (low === '!menu') {
      await sock.sendMessage(jid, {
        text: `🎰 GAMBLING V2 FINAL
💰 $${user.gMoney}

!slot <bet> - 4 emoji slots
  3 same = 2x | 4 same = 3x
  Shows Bet/Won/Balance

!19 balls 100 - Plinko multi
  Cost = balls x bet (19x100=1900)

!mines <bet> - 5 bombs 5x5
  ⬜ white not stepped
  🟩 green safe
  🟥 red bomb
  6 tiles = 2x | Need 3 to !stop
  !pick 1-25

!wheel <bet>
  1% BANKRUPT | 1% JACKPOT x10
  98% = x0.1 x0.2 x0.5 x1 x1.5 x2

!double <bet>
  Double or nothing, can !stop after 3 wins

!stock - 4 stocks move every 8s
  !stock buy BTC 5 / !stock sell DOGE 2

!bal !daily !lb !cf
!on / !off`
      })
      return
    }

    if (low === '!bal') {
      let sVal = user.stocks.BTC * stocks.BTC.price + user.stocks.ETH * stocks.ETH.price + user.stocks.DOGE * stocks.DOGE.price + user.stocks.PEPE * stocks.PEPE.price
      await sock.sendMessage(jid, { text: `💰 Cash $${user.gMoney}\nStocks $${sVal} | Total $${user.gMoney + sVal}\nBTC ${user.stocks.BTC} ETH ${user.stocks.ETH} DOGE ${user.stocks.DOGE} PEPE ${user.stocks.PEPE}` })
      return
    }

    if (low === '!daily') {
      if (Date.now() - user.daily < 86400000) { await sock.sendMessage(jid, { text: `⏰ Daily in ${Math.ceil((86400000 - (Date.now() - user.daily)) / 3600000)}h` }); return }
      user.daily = Date.now(); user.gMoney += 5000
      await sock.sendMessage(jid, { text: `✅ +$5000 Daily | New Balance $${user.gMoney}` })
      return
    }

    if (low === '!lb') {
      let top = Object.entries(users).sort((a, b) => b[1].gMoney - a[1].gMoney).slice(0, 5)
      let txt = '🏆 TOP RICH:\n'; top.forEach((u, i) => txt += `${i + 1}. @${u[0].split('@')[0]} $${u[1].gMoney}\n`)
      await sock.sendMessage(jid, { text: txt, mentions: top.map(u => u[0]) })
      return
    }

    // SLOTS - 4 emoji, 3 same 2x, 4 same 3x
    if (low.startsWith('!slot')) {
      let bet = parseInt(low.split(' ')[1]) || 500
      if (user.gMoney < bet) { await sock.sendMessage(jid, { text: `❌ Need $${bet} have $${user.gMoney}` }); return }
      user.gMoney -= bet
      let emojis = ['🍒', '🍋', '🍇', '🔔', '💎', '7️⃣', '🍉']
      let slots = [emojis[Math.floor(Math.random() * emojis.length)], emojis[Math.floor(Math.random() * emojis.length)], emojis[Math.floor(Math.random() * emojis.length)], emojis[Math.floor(Math.random() * emojis.length)]]
      let counts = {}; slots.forEach(e => counts[e] = (counts[e] || 0) + 1)
      let maxSame = Math.max(...Object.values(counts))
      let won = 0, res = 'LOSE'
      if (maxSame === 4) { won = bet * 3; res = 'JACKPOT 4 SAME! 3x'; user.gMoney += won }
      else if (maxSame === 3) { won = bet * 2; res = 'WIN 3 SAME! 2x'; user.gMoney += won }
      await sock.sendMessage(jid, { text: `🎰 SLOTS\n| ${slots[0]} | ${slots[1]} | ${slots[2]} | ${slots[3]} |\n${res}\nBet: $${bet} | Won: $${won} | Balance: $${user.gMoney}` })
      return
    }

    if (low.startsWith('!cf')) {
      let bet = parseInt(low.split(' ')[1]) || 100
      if (user.gMoney < bet) return
      let win = Math.random() < 0.5
      if (win) user.gMoney += bet; else user.gMoney -= bet
      await sock.sendMessage(jid, { text: `${win ? 'WIN' : 'LOSE'} | Bet: $${bet} | Won: $${win ? bet : 0} | Balance: $${user.gMoney}` })
      return
    }

    // PLINKO MULTI - !19 balls 100
    let multiMatch = low.match(/^!(\d+)\s+balls\s+(\d+)/)
    if (multiMatch) {
      let count = parseInt(multiMatch[1]), perBet = parseInt(multiMatch[2])
      if (count < 1 || count > 50) { await sock.sendMessage(jid, { text: '❌ Balls 1-50' }); return }
      let total = count * perBet
      if (user.gMoney < total) { await sock.sendMessage(jid, { text: `❌ Need $${total} for ${count} balls x $${perBet}` }); return }
      user.gMoney -= total
      let mults = [0.1, 0.2, 0.5, 1, 1.5, 2, 5, 10], totalWin = 0, results = []
      for (let i = 0; i < count; i++) { let m = mults[Math.floor(Math.random() * mults.length)]; results.push(`x${m}`); totalWin += Math.floor(perBet * m) }
      user.gMoney += totalWin
      await sock.sendMessage(jid, { text: `🔴 PLINKO ${count} balls x $${perBet} = Cost $${total}\n${results.join(' ')}\nBet: $${total} | Won: $${totalWin} | Balance: $${user.gMoney}` })
      return
    }
    if (low.startsWith('!plinko') && !multiMatch) {
      let bet = parseInt(low.split(' ')[1]) || 500
      if (user.gMoney < bet) return
      user.gMoney -= bet
      let mults = [0.1, 0.2, 0.5, 1, 1.5, 2, 5, 10], m = mults[Math.floor(Math.random() * mults.length)], win = Math.floor(bet * m)
      user.gMoney += win
      await sock.sendMessage(jid, { text: `🔴 PLINKO x${m}\nBet: $${bet} | Won: $${win} | Balance: $${user.gMoney}` })
      return
    }

    // MINES - white/green/red grid, 6 tiles = 2x
    if (low.startsWith('!mines')) {
      let bet = parseInt(low.split(' ')[1]) || 500
      if (user.gMoney < bet) { await sock.sendMessage(jid, { text: `❌ Need $${bet}` }); return }
      if (user.mines) { await sock.sendMessage(jid, { text: '❌ Already in mines - !pick or !stop' }); return }
      user.gMoney -= bet
      let bombs = []; while (bombs.length < 5) { let n = Math.floor(Math.random() * 25) + 1; if (!bombs.includes(n)) bombs.push(n) }
      user.mines = { bet: bet, bombs: bombs, revealed: [], mult: 1 }
      await sock.sendMessage(jid, { text: `💣 MINES $${bet} - 6 tiles = 2x\n${renderMinesGrid(user.mines)}\n!pick 1-25 (need 3 to stop)` })
      return
    }
    if (low.startsWith('!pick')) {
      if (!user.mines) { await sock.sendMessage(jid, { text: '❌ No mines - !mines <bet>' }); return }
      let n = parseInt(low.split(' ')[1]); if (n < 1 || n > 25) { await sock.sendMessage(jid, { text: '❌ Pick 1-25' }); return }
      if (user.mines.revealed.includes(n)) { await sock.sendMessage(jid, { text: '❌ Already picked' }); return }
      if (user.mines.bombs.includes(n)) {
        user.mines.revealed.push(n)
        await sock.sendMessage(jid, { text: `💥 BOOM Tile ${n} BOMB!\n${renderMinesGrid(user.mines)}\nBet: $${user.mines.bet} | Won: $0 | Balance: $${user.gMoney}\nBombs: ${user.mines.bombs.join(', ')}` })
        user.mines = null; return
      }
      user.mines.revealed.push(n)
      let count = user.mines.revealed.length
      if (count <= 6) user.mines.mult = 1 + (count * (1 / 6))
      else user.mines.mult = 2 + (count - 6) * 0.3
      let pot = Math.floor(user.mines.bet * user.mines.mult)
      await sock.sendMessage(jid, { text: `✅ Safe ${n} 🟩\n${renderMinesGrid(user.mines)}\nTiles ${count} | x${user.mines.mult.toFixed(2)} | Pot $${pot}\n${count >= 3 ? '!stop to cashout' : `Need ${3 - count} more`}` })
      return
    }
    if (low === '!stop') {
      if (user.mines) {
        if (user.mines.revealed.length < 3) { await sock.sendMessage(jid, { text: `❌ Need 3 tiles - have ${user.mines.revealed.length}` }); return }
        let win = Math.floor(user.mines.bet * user.mines.mult)
        user.gMoney += win
        await sock.sendMessage(jid, { text: `✅ STOP\n${renderMinesGrid(user.mines)}\nBet: $${user.mines.bet} | Won: $${win} | Balance: $${user.gMoney}` })
        user.mines = null; return
      }
      if (user.double) {
        if (user.double.streak < 3) { await sock.sendMessage(jid, { text: `❌ Need 3 wins - have ${user.double.streak}` }); return }
        let win = user.double.amount; user.gMoney += win
        await sock.sendMessage(jid, { text: `✅ DOUBLE STOP\nBet: $${win / 2} | Won: $${win} | Balance: $${user.gMoney}` })
        user.double = null; return
      }
    }

    // WHEEL - 1% bankrupt/jackpot
    if (low.startsWith('!wheel')) {
      let bet = parseInt(low.split(' ')[1]) || 500
      if (user.gMoney < bet) { await sock.sendMessage(jid, { text: `❌ Need $${bet}` }); return }
      user.gMoney -= bet
      let r = Math.random() * 100, res, win = 0
      if (r < 1) { res = 'BANKRUPT'; win = 0 }
      else if (r < 2) { res = 'JACKPOT x10'; win = bet * 10 }
      else { let rest = [{ n: 'x0.1', m: 0.1 }, { n: 'x0.2', m: 0.2 }, { n: 'x0.5', m: 0.5 }, { n: 'x1', m: 1 }, { n: 'x1.5', m: 1.5 }, { n: 'x2', m: 2 }]; let p = rest[Math.floor(Math.random() * rest.length)]; res = p.n; win = Math.floor(bet * p.m) }
      user.gMoney += win
      await sock.sendMessage(jid, { text: `🎡 WHEEL ${res}!\nBet: $${bet} | Won: $${win} | Balance: $${user.gMoney}` })
      return
    }

    // DOUBLE - need 3 wins
    if (low.startsWith('!double')) {
      let bet = parseInt(low.split(' ')[1]) || 0
      if (!user.double) {
        if (bet === 0 || user.gMoney < bet) { await sock.sendMessage(jid, { text: '❌ !double <bet>' }); return }
        user.gMoney -= bet; user.double = { amount: bet * 2, streak: 1 }
        await sock.sendMessage(jid, { text: `🎲 DOUBLE #1 Bet $${bet} Pot $${bet * 2} Streak 1/3 need 3 to stop` })
        return
      } else {
        let win = Math.random() < 0.5
        if (win) { user.double.amount *= 2; user.double.streak++; await sock.sendMessage(jid, { text: `✅ WIN #${user.double.streak} Pot $${user.double.amount} ${user.double.streak >= 3 ? 'Can !stop' : `Need ${3 - user.double.streak} more`}` }) }
        else { await sock.sendMessage(jid, { text: `❌ LOSE #${user.double.streak + 1} Lost $${user.double.amount / 2}` }); user.double = null }
        return
      }
    }

    // STOCK - 4 stocks
    if (low.startsWith('!stock')) {
      let parts = low.split(' ')
      if (parts.length === 1) {
        let txt = '📊 STOCKS (every 8s):\n'; for (let k in stocks) { txt += `${stocks[k].emoji} ${k}: $${stocks[k].price} Own ${user.stocks[k]}\n` }
        txt += '!stock buy BTC 5\n!stock sell DOGE 2'; await sock.sendMessage(jid, { text: txt }); return
      }
      if (parts[1] === 'buy') {
        let coin = parts[2]?.toUpperCase(), amt = parseInt(parts[3]) || 1
        if (!stocks[coin]) { await sock.sendMessage(jid, { text: '❌ BTC ETH DOGE PEPE' }); return }
        let cost = amt * stocks[coin].price; if (user.gMoney < cost) { await sock.sendMessage(jid, { text: `❌ Need $${cost}` }); return }
        user.gMoney -= cost; user.stocks[coin] += amt
        await sock.sendMessage(jid, { text: `📈 Bought ${amt} ${coin} @ $${stocks[coin].price} = $${cost} | Balance $${user.gMoney}` }); return
      }
      if (parts[1] === 'sell') {
        let coin = parts[2]?.toUpperCase(), amt = parseInt(parts[3]) || 1
        if (!stocks[coin] || user.stocks[coin] < amt) { await sock.sendMessage(jid, { text: `❌ You own ${user.stocks[coin] || 0} ${coin}` }); return }
        let gain = amt * stocks[coin].price; user.stocks[coin] -= amt; user.gMoney += gain
        await sock.sendMessage(jid, { text: `📉 Sold ${amt} ${coin} @ $${stocks[coin].price} = $${gain} | Balance $${user.gMoney}` }); return
      }
    }
  })
}
startBot()

const app = express()
app.get('/', async (req, res) => {
  if (isConnected) return res.send(`<h1>Bot Connected ✅ V2 Final</h1><p>BTC $${stocks.BTC.price} ETH $${stocks.ETH.price} DOGE $${stocks.DOGE.price} PEPE $${stocks.PEPE.price}</p>`)
  if (!lastQR) return res.send('<h1>Waiting QR...</h1><script>setTimeout(()=>location.reload(),5000)</script>')
  const img = await qrcode.toDataURL(lastQR)
  res.send(`<img src="${img}"><h2>Scan - V2 Final</h2><script>setTimeout(()=>location.reload(),10000)</script>`)
})
app.listen(process.env.PORT || 3000, () => console.log('Web on', process.env.PORT || 3000))
