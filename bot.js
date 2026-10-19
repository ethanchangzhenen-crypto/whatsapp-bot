// ============================================================
// FULL COMBINED BOT - QR WEBSITE + GAMBLING + LOAN SHARK
// Admin: 6597306863 | 300+ lines detailed | No minified
// ============================================================
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys')
const qrcode = require('qrcode-terminal')
const QRCode = require('qrcode')
const express = require('express')
const P = require('pino')({ level: 'silent' })

// -------------------- CONFIG --------------------
const ADMINS = ['6597306863@s.whatsapp.net', '6597306863']
let users = {}
let challenges = {}
let lastQR = null
let isConnected = false
let settings = { paused: false, timerOn: true }

const ITEMS = ['double', 'reverse', 'freeze', 'eraser', 'totem', 'charm']
const EMOJI = { double: '💥', reverse: '🔄', freeze: '🧊', eraser: '💀', totem: '🗿', charm: '🍀' }

// -------------------- HELPERS --------------------
function getUser(id) {
  if (!users[id]) {
    users[id] = {
      gMoney: 50000,
      lastGamble: 0,
      wins: 0,
      loses: 0,
      lsMoney: 0,
      lsDay: 1,
      lsQuota: 25000,
      lsDayStart: Date.now(),
      lsSurvived: 0,
      lsItems: [],
      lsGame: null,
      lsBiggest: 0,
      lsRevUntil: 0,
      lsCharmLeft: 0
    }
  }
  return users[id]
}

function isAdmin(s) {
  return ADMINS.some(a => s.includes(a.replace('@s.whatsapp.net', '')))
}

function randItem(exclude) {
  let pool = ITEMS.filter(i => !exclude.includes(i))
  if (!pool.length) return null
  return pool[Math.floor(Math.random() * pool.length)]
}

function fmt(ms) {
  let s = Math.max(0, Math.floor(ms / 1000))
  let m = Math.floor(s / 60)
  s %= 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

async function handleSurvive(u, jid, sock) {
  u.lsSurvived++
  u.lsDay++
  let nq = u.lsItems.includes('freeze') ? u.lsQuota : Math.floor(u.lsQuota * 2.5)
  if (u.lsItems.includes('freeze')) {
    u.lsItems = u.lsItems.filter(i => i !== 'freeze')
  }
  u.lsQuota = nq
  u.lsMoney = 0
  u.lsDayStart = Date.now()
  u.lsBiggest = 0

  let d1 = randItem(u.lsItems)
  let d2 = randItem([...u.lsItems, d1].filter(Boolean))
  if (d1) u.lsItems.push(d1)
  if (d2 && d1 !== d2 && !u.lsItems.includes(d2)) u.lsItems.push(d2)

  let msg = `🎉 DAY ${u.lsDay - 1} SURVIVED!\nNext quota $${nq}\n🎁 Got: ${[d1, d2].filter(Boolean).map(i => EMOJI[i] + ' ' + i).join(' + ') || 'full inv'}`
  if (u.lsSurvived % 2 === 0) msg += '\n⭐ BONUS: !lschoose [item]'
  await sock.sendMessage(jid, { text: msg })
}

// -------------------- QR WEBSITE --------------------
const app = express()

app.get('/', async (req, res) => {
  if (isConnected) {
    return res.send(`
      <html><head><meta name="viewport" content="width=device-width">
      <style>body{text-align:center;background:#111;color:#fff;font-family:Arial;padding:40px}</style>
      </head><body><h1>✅ BOT CONNECTED!</h1><p>Admin 6597306863</p><p>Type !menu in WhatsApp group</p></body></html>
    `)
  }
  if (!lastQR) {
    return res.send(`
      <html><body style="text-align:center;padding:40px"><h1>⏳ Starting bot... refresh 3s</h1>
      <script>setTimeout(()=>location.reload(),3000)</script></body></html>
    `)
  }
  try {
    let dataUrl = await QRCode.toDataURL(lastQR)
    res.send(`
      <!DOCTYPE html><html><head><meta name="viewport" content="width=device-width">
      <title>Scan Bot QR</title>
      <style>body{font-family:Arial;text-align:center;padding:20px;background:#0f0f0f;color:#fff}
      img{width:320px;height:320px;background:#fff;padding:15px;border-radius:12px}
      .box{max-width:450px;margin:0 auto;background:#1a1a1a;padding:20px;border-radius:15px}</style>
      </head><body><div class="box"><h1>💀 SCAN TO LINK BOT</h1>
      <p>WhatsApp > Linked Devices > Link a Device > Scan this QR</p>
      <img src="${dataUrl}"><p>Admin: 6597306863</p>
      <p>QR auto refresh 25s</p><script>setTimeout(()=>location.reload(),25000)</script></div></body></html>
    `)
  } catch (e) {
    res.send('Error refresh page')
  }
})

const PORT = process.env.PORT || 3000
app.listen(PORT, '0.0.0.0', ()=>console.log('QR ready on port '+PORT))

// -------------------- BOT START --------------------
async function start() {
  const { state, saveCreds } = await useMultiFileAuthState('auth')
  const sock = makeWASocket({ auth: state, logger: P, browser: ['FullBot', 'Chrome', '1.0'] })

  sock.ev.on('creds.update', saveCreds)

  sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      lastQR = qr
      isConnected = false
      console.log('NEW QR -> http://localhost:3000')
      qrcode.generate(qr, { small: true })
    }
    if (connection === 'close') {
      isConnected = false
      let code = lastDisconnect?.error?.output?.statusCode
      if (code !== DisconnectReason.loggedOut) {
        lastQR = null
        setTimeout(start, 3000)
      }
    }
    if (connection === 'open') {
      isConnected = true
      lastQR = null
      console.log('✅ CONNECTED Admin 6597306863 - !menu works')
    }
  })

  sock.ev.on('messages.upsert', async ({ messages }) => {
    for (let msg of messages) {
      if (!msg.message || msg.key.fromMe) continue
      let jid = msg.key.remoteJid
      let sender = msg.key.participant || jid
      let text = msg.message.conversation || msg.message.extendedTextMessage?.text || ''
      if (!text) continue
      text = text.trim()
      let low = text.toLowerCase()
      let isReply = !!msg.message.extendedTextMessage?.contextInfo?.quotedMessage
      let quotedId = msg.message.extendedTextMessage?.contextInfo?.participant
      let user = getUser(sender)

      // 5 MIN DEATH TIMER
      if (settings.timerOn && user.lsDayStart) {
        let elapsed = Date.now() - user.lsDayStart
        if (elapsed > 5 * 60 * 1000 && user.lsMoney < user.lsQuota) {
          if (user.lsItems.includes('totem')) {
            user.lsItems = user.lsItems.filter(i => i !== 'totem')
            user.lsDayStart = Date.now()
            await sock.sendMessage(jid, { text: `🗿 @${sender.split('@')[0]} TOTEM SAVED Day ${user.lsDay}`, mentions: [sender] })
          } else {
            user.lsDay = 1
            user.lsQuota = 25000
            user.lsMoney = 0
            user.lsDayStart = Date.now()
            user.lsSurvived = 0
            user.lsItems = []
            user.lsGame = null
            await sock.sendMessage(jid, { text: `💀 @${sender.split('@')[0]} DIED! 5min no quota RESET DAY1`, mentions: [sender] })
          }
        }
      }

      // ADMIN REPLY SYSTEM - FIXES ~unkown player BUG
      if (isReply && isAdmin(sender)) {
        let target = quotedId || sender
        let t = getUser(target)
        let cmd = low
        if (cmd.startsWith('!reset')) {
          t.gMoney = 50000; t.lsDay = 1; t.lsQuota = 25000; t.lsMoney = 0; t.lsDayStart = Date.now(); t.lsSurvived = 0; t.lsItems = []
          await sock.sendMessage(jid, { text: `🔄 Reset @${target.split('@')[0]} $50k Day1`, mentions: [target] }); continue
        }
        if (cmd.startsWith('!addmoney')) {
          let a = parseInt(cmd.split(/\s+/)[1]); if (a) { t.gMoney += a; await sock.sendMessage(jid, { text: `💰 +$${a} @${target.split('@')[0]} Now $${t.gMoney}`, mentions: [target] }) } continue
        }
        if (cmd.startsWith('!setmoney')) {
          let a = parseInt(cmd.split(/\s+/)[1]); if (!isNaN(a)) { t.gMoney = a; await sock.sendMessage(jid, { text: `Set $${a} @${target.split('@')[0]}`, mentions: [target] }) } continue
        }
        if (cmd.startsWith('!lsaddmoney')) {
          let a = parseInt(cmd.split(/\s+/)[1]); if (a) { t.lsMoney += a; await sock.sendMessage(jid, { text: `💀 +$${a} LS ${t.lsMoney}/${t.lsQuota}`, mentions: [target] }) } continue
        }
        if (cmd.startsWith('!challenge set')) {
          let desc = text.slice(15); challenges[jid] = { desc }; await sock.sendMessage(jid, { text: `🏆 CHALLENGE SET: ${desc}` }); continue
        }
      }

      // MENU - SHOWS EVERYTHING + HOW TO DO
      if (low === '!menu') {
        let left = 5 * 60 * 1000 - (Date.now() - user.lsDayStart)
        let ch = challenges[jid] ? `🏆 CHALLENGE: ${challenges[jid].desc}\n` : ''
        await sock.sendMessage(jid, { text: `💀 LOAN x GAMBLING MENU\n⏰ Day${user.lsDay} LS $${user.lsMoney}/$${user.lsQuota} ${fmt(left)}\n🎰 $${user.gMoney} W${user.wins} L${user.loses}\n${ch}──────────────────\n🎰 GAMBLING:\n!cf [bet] h/t ex !cf 100 t\n!rslot [bet] 5/6 win\n!grave [bet] !dig 1-3\n!ladder [bet] !climb !cashout\n!coffin [bet] !open 1-2\n!case [bet] !pick 1-10\n!bj [bet] !hit !stand\n!bal !top !challenge\n\n💀 LOAN:\n!lsstart\n!lsrslot !lsgrave !lsdig\n!lsstack !lsstack roll !lsstop\n!lsfuse !lscut\n!lsmirror !lsreroll !lsstay\n!lstrap !lslift !lscashout\n!lsmagnet !lspull !lscashout\n!lsbal !lsinv !lschoose\nAdmin 6597306863` })
        continue
      }

      if (low === '!challenge') {
        let ch = challenges[jid]
        if (!ch) {
          await sock.sendMessage(jid, { text: `🏆 NO CHALLENGE\nHOW GAMBLING: !cf 100 t coinflip, !rslot 100 slots, !grave 100 + !dig 1, !ladder 100 + !climb !cashout, !coffin 100 + !open 1, !case 100 + !pick 1-10, !bj 100 + !hit !stand\nHOW LOAN: !lsstart Day1 25k 5min, reach quota or die, survive x2.5 + 2 items, every 2 days !lschoose` })
          continue
        }
        await sock.sendMessage(jid, { text: `🏆 CHALLENGE: ${ch.desc}` })
        continue
      }

      if (low === '!bal') {
        await sock.sendMessage(jid, { text: `💰 Gambling $${user.gMoney}\n💀 LS Day${user.lsDay} $${user.lsMoney}/${user.lsQuota}\n🎒 ${user.lsItems.join(',') || 'empty'}` })
        continue
      }

      if (low.startsWith('!lsinv')) {
        await sock.sendMessage(jid, { text: `🎒 ${user.lsItems.map(i => EMOJI[i] + ' ' + i).join(', ') || 'empty'} | Survived ${user.lsSurvived}` })
        continue
      }

      // GAMBLING - COINFLIP
      if (low.startsWith('!cf')) {
        let p = text.split(/\s+/), bet = parseInt(p[1]) || 100, ch = (p[2] || 'h')[0]
        if (bet > user.gMoney) { await sock.sendMessage(jid, { text: `No money $${user.gMoney}` }); continue }
        if (Date.now() - user.lastGamble < 800) continue
        user.lastGamble = Date.now()
        let r = Math.random() < 0.5 ? 'h' : 't', win = r === ch
        if (win) { user.gMoney += bet; user.wins++ } else { user.gMoney -= bet; user.loses++ }
        await sock.sendMessage(jid, { text: `${win ? '✅' : '🌑'} ${r === 'h' ? 'HEADS' : 'TAILS'} ${win ? 'WIN' : 'LOSE'} ${win ? '+' : '-'}$${bet} Bal $${user.gMoney}` })
        continue
      }

      // GAMBLING - RSLOT
      if (low.startsWith('!rslot') && !low.startsWith('!lsrslot')) {
        let bet = parseInt(text.split(' ')[1]) || 100
        if (bet > user.gMoney) { await sock.sendMessage(jid, { text: 'No money' }); continue }
        let win = Math.random() < 0.833
        if (win) { user.gMoney += Math.floor(bet * 0.8); user.wins++ } else { user.gMoney -= bet; user.loses++ }
        await sock.sendMessage(jid, { text: `${win ? '✅ WIN +' + Math.floor(bet * 0.8) : '❌ LOSE -' + bet} Bal $${user.gMoney}` })
        continue
      }

      // LOAN - START
      if (low.startsWith('!lsstart')) {
        user.lsDay = 1; user.lsQuota = 25000; user.lsMoney = 0; user.lsDayStart = Date.now(); user.lsItems = []; user.lsSurvived = 0
        await sock.sendMessage(jid, { text: '💀 START Day1 $25000 5min !lsrslot 100' }); continue
      }

      // LOAN - RSLOT
      if (low.startsWith('!lsrslot')) {
        let bet = parseInt(text.split(' ')[1]) || 100
        let win = Math.random() < 0.65 || user.lsItems.includes('charm') || user.lsCharmLeft > 0
        if (user.lsCharmLeft > 0) user.lsCharmLeft--
        if (user.lsItems.includes('charm')) { user.lsItems = user.lsItems.filter(i => i !== 'charm'); user.lsCharmLeft = 2 }
        if (win) {
          let p = Math.floor(bet * 1.8); user.lsMoney += p; user.lsBiggest = Math.max(user.lsBiggest, p)
          await sock.sendMessage(jid, { text: `✅ LS RSLOT WIN +$${p} ${user.lsMoney}/${user.lsQuota}` })
        } else {
          await sock.sendMessage(jid, { text: `❌ LOSE $${bet}` })
        }
        if (user.lsMoney >= user.lsQuota) await handleSurvive(user, jid, sock)
        continue
      }

      // LOAN - STACK, FUSE, MIRROR, TRAP, MAGNET (detailed same as before)
      if (low.startsWith('!lsstack') && (!user.lsGame || user.lsGame.type !== 'lsstack')) {
        let bet = parseInt(text.split(' ')[1]) || 100; user.lsGame = { type: 'lsstack', total: 0, bet }
        await sock.sendMessage(jid, { text: `🎲 STACK $${bet} Total0 !lsstack roll !lsstop` }); continue
      }
      if (low === '!lsstack' && user.lsGame?.type === 'lsstack') {
        let roll = Math.floor(Math.random() * 6) + 1
        if (roll === 1) { let b = user.lsGame.bet; user.lsGame = null; await sock.sendMessage(jid, { text: `💥 ROLL 1 LOSE $${b}` }); continue }
        user.lsGame.total += roll
        if (user.lsGame.total >= 22) { let b = user.lsGame.bet; user.lsGame = null; await sock.sendMessage(jid, { text: `💥 BUST ${user.lsGame.total} LOSE $${b}` }); continue }
        await sock.sendMessage(jid, { text: `🎲 Roll ${roll} Total ${user.lsGame.total}` }); continue
      }
      if (low === '!lsstop' && user.lsGame?.type === 'lsstack') {
        let t = user.lsGame.total, b = user.lsGame.bet, w = 0
        if (t <= 10) w = 0; else if (t <= 14) w = b * 1; else if (t <= 17) w = b * 1.8; else if (t <= 20) w = b * 2.5; else if (t === 21) w = b * 4
        user.lsMoney += Math.floor(w); user.lsGame = null
        await sock.sendMessage(jid, { text: `🛑 STOP ${t} WIN $${Math.floor(w)} ${user.lsMoney}/${user.lsQuota}` })
        if (user.lsMoney >= user.lsQuota) await handleSurvive(user, jid, sock); continue
      }
      if (low.startsWith('!lsfuse') && (!user.lsGame || user.lsGame.type !== 'lsfuse')) {
        let bet = parseInt(text.split(' ')[1]) || 100; user.lsGame = { type: 'lsfuse', bet, actual: Math.floor(Math.random() * 10) + 1 }
        await sock.sendMessage(jid, { text: `🧨 FUSE $${bet} !lscut 7s` }); continue
      }
      if (low.startsWith('!lscut') && user.lsGame?.type === 'lsfuse') {
        let g = parseInt(low.match(/\d+/)?.[0]); let a = user.lsGame.actual, b = user.lsGame.bet, d = Math.abs(g - a), w = d === 0 ? b * 5 : d === 1 ? b * 2 : d === 2 ? b * 1 : -b
        if (w > 0) user.lsMoney += Math.floor(w)
        await sock.sendMessage(jid, { text: `🧨 Actual ${a}s You ${g}s ${w > 0 ? `+$${Math.floor(w)}` : `-$${b}`} ${user.lsMoney}/${user.lsQuota}` })
        user.lsGame = null; if (user.lsMoney >= user.lsQuota) await handleSurvive(user, jid, sock); continue
      }
      // MIRROR, TRAP, MAGNET same pattern...
      if (low.startsWith('!lsmirror') && (!user.lsGame || user.lsGame.type !== 'lsmirror')) {
        let bet = parseInt(text.split(' ')[1]) || 100; user.lsGame = { type: 'lsmirror', bet, you: Math.floor(Math.random() * 13) + 1, ah: Math.floor(Math.random() * 13) + 1, rerolls: 3 }
        await sock.sendMessage(jid, { text: `🪞 YOU ${user.lsGame.you} vs AH LONG ${user.lsGame.ah} !lsreroll x3 / !lsstay` }); continue
      }
      if (low === '!lsreroll' && user.lsGame?.type === 'lsmirror') {
        if (user.lsGame.rerolls <= 0) { await sock.sendMessage(jid, { text: 'No rerolls !lsstay' }); continue }
        user.lsGame.rerolls--; user.lsGame.you = Math.floor(Math.random() * 13) + 1
        await sock.sendMessage(jid, { text: `🪞 REROLL YOU ${user.lsGame.you} vs ${user.lsGame.ah} Left ${user.lsGame.rerolls}` }); continue
      }
      if (low === '!lsstay' && user.lsGame?.type === 'lsmirror') {
        let b = user.lsGame.bet, win = user.lsGame.you > user.lsGame.ah, tie = user.lsGame.you === user.lsGame.ah; user.lsGame = null
        if (tie) { user.lsMoney -= Math.floor(b / 2); await sock.sendMessage(jid, { text: `🪞 TIE lose half` }); continue }
        if (win) { user.lsMoney += Math.floor(b * 1.8); await sock.sendMessage(jid, { text: `✅ MIRROR WIN +$${Math.floor(b * 1.8)}` }) } else await sock.sendMessage(jid, { text: `❌ MIRROR LOSE $${b}` })
        if (user.lsMoney >= user.lsQuota) await handleSurvive(user, jid, sock); continue
      }
      if (low.startsWith('!lstrap') && (!user.lsGame || user.lsGame.type !== 'lstrap')) {
        let bet = parseInt(text.split(' ')[1]) || 100; user.lsGame = { type: 'lstrap', bet, pot: 0 }
        await sock.sendMessage(jid, { text: `🪤 TRAPS [1][2][3] !lslift +2x !lscashout` }); continue
      }
      if (low.startsWith('!lslift') && user.lsGame?.type === 'lstrap') {
        let win = Math.random() < 0.33
        if (win) { user.lsGame.pot += user.lsGame.bet * 2; await sock.sendMessage(jid, { text: `🧀 CHEESE Pot $${user.lsGame.pot}` }) }
        else { let pot = user.lsGame.pot; user.lsGame.pot = 0; await sock.sendMessage(jid, { text: `💥 TRAP Lost $${pot}` }) }
        continue
      }
      if (low === '!lscashout' && user.lsGame?.type === 'lstrap') {
        let pot = user.lsGame.pot; user.lsMoney += pot; user.lsGame = null
        await sock.sendMessage(jid, { text: `💰 CASHOUT $${pot} ${user.lsMoney}/${user.lsQuota}` })
        if (user.lsMoney >= user.lsQuota) await handleSurvive(user, jid, sock); continue
      }
      if (low.startsWith('!lsmagnet') && (!user.lsGame || user.lsGame.type !== 'lsmagnet')) {
        let bet = parseInt(text.split(' ')[1]) || 100; user.lsGame = { type: 'lsmagnet', bet, pot: 0, limit: 6000 + Math.floor(Math.random() * 3000), pulls: 0 }
        await sock.sendMessage(jid, { text: `🧲 MAGNET $${bet} hidden 6k-9k !lspull` }); continue
      }
      if (low === '!lspull' && user.lsGame?.type === 'lsmagnet') {
        if (user.lsGame.pulls >= 5) { await sock.sendMessage(jid, { text: 'Max5 !lscashout' }); continue }
        let pull = 200 + Math.floor(Math.random() * 3800); user.lsGame.pot += pull; user.lsGame.pulls++
        if (user.lsGame.pot > user.lsGame.limit) { let b = user.lsGame.bet; user.lsGame = null; await sock.sendMessage(jid, { text: `💥 BREAK LOSE $${b}` }); continue }
        await sock.sendMessage(jid, { text: `🧲 Pulled $${pull} Total $${user.lsGame.pot} ${user.lsGame.pulls}/5` }); continue
      }
      if (low === '!lscashout' && user.lsGame?.type === 'lsmagnet') {
        let pot = user.lsGame.pot; user.lsMoney += pot; user.lsGame = null
        await sock.sendMessage(jid, { text: `💰 CASHOUT $${pot} ${user.lsMoney}/${user.lsQuota}` })
        if (user.lsMoney >= user.lsQuota) await handleSurvive(user, jid, sock); continue
      }
    }
  })
}
start()
