const { default: makeWASocket, useMultiFileAuthState } = require('@whiskeysockets/baileys')
const P = require('pino')
const express = require('express')
const QR = require('qrcode')
const fs = require('fs')

const app = express()
let qrData = ''
app.get('/', async (req,res)=>{
  if(!qrData) return res.send('<h1>BOT CONNECTED ✅ Gambling ready!</h1><p>Commands: .bal .daily .slots 100 .bj 100</p>')
  res.send(`<h1>SCAN QR</h1><img src="${qrData}" width="300"><script>setTimeout(()=>location.reload(),20000)</script>`)
})
app.listen(process.env.PORT||3000)

// --- ECONOMY ---
let data = {}
try{ data = JSON.parse(fs.readFileSync('./data.json','utf8')) }catch(e){ data = {} }
function save(){ fs.writeFileSync('./data.json', JSON.stringify(data)) }
function getUser(id){ if(!data[id]) data[id]={money:1000, lastDaily:0}; return data[id] }

async function start(){
  const { state, saveCreds } = await useMultiFileAuthState('auth3')
  const sock = makeWASocket({ auth: state, logger: P({level:'silent'}), browser: ['Chrome','Bot','1'] })
  sock.ev.on('creds.update', saveCreds)
  sock.ev.on('connection.update', async (u)=>{
    if(u.qr){ qrData = await QR.toDataURL(u.qr) }
    if(u.connection==='open'){ qrData=''; console.log('✅ CONNECTED') }
    if(u.connection==='close'){ setTimeout(start,3000) }
  })
  sock.ev.on('messages.upsert', async (m)=>{
    const msg=m.messages[0]
    if(!msg.message) return
    // ALLOW your own messages too so YOU can play
    // if(msg.key.fromMe) return  <-- REMOVED so you can play

    const text = msg.message.conversation || msg.message.extendedTextMessage?.text || ''
    if(!text) return
    const jid = msg.key.remoteJid
    const sender = msg.key.participant || jid
    const user = getUser(sender)
    const args = text.trim().split(/ +/)
    const cmd = args[0].toLowerCase()

    console.log('CMD:', cmd)

    if(cmd==='.menu' || cmd==='.help'){
      await sock.sendMessage(jid,{text:`🎰 *GAMBLING BOT* 🎰\n\n.bal - check balance\n.daily - $500 daily\n.slots <bet> - slot machine\n.coinflip <bet> h/t\n.bj <bet> - blackjack\n.lb - leaderboard\n\nYou have: $${user.money}`})
    }
    else if(cmd==='.bal' || cmd==='.balance'){
      await sock.sendMessage(jid,{text:`💰 Balance: $${user.money}`})
    }
    else if(cmd==='.daily'){
      const now = Date.now()
      if(now - user.lastDaily < 86400000){
        const left = Math.ceil((86400000 - (now - user.lastDaily))/3600000)
        await sock.sendMessage(jid,{text:`⏰ Come back in ${left}h`})
      } else {
        user.money+=500; user.lastDaily=now; save()
        await sock.sendMessage(jid,{text:`✅ Daily +$500! New balance: $${user.money}`})
      }
    }
    else if(cmd==='.slots'){
      let bet = parseInt(args[1])||100
      if(user.money<bet) return sock.sendMessage(jid,{text:`❌ Not enough money`})
      if(bet<=0) return
      const emojis=['🍒','🍋','🔔','💎','7️⃣']
      const r=[emojis[Math.floor(Math.random()*5)], emojis[Math.floor(Math.random()*5)], emojis[Math.floor(Math.random()*5)]]
      let win=0
      if(r[0]===r[1] && r[1]===r[2]) win=bet*5
      else if(r[0]===r[1] || r[1]===r[2] || r[0]===r[2]) win=bet*1.5
      user.money=user.money-bet+win; save()
      await sock.sendMessage(jid,{text:`🎰 | ${r.join(' | ')} |\n${win>0?`🎉 WIN $${win}`:`💸 LOSE $${bet}`}\nBalance: $${user.money}`})
    }
    else if(cmd==='.coinflip' || cmd==='.cf'){
      let bet=parseInt(args[1])||100
      let choice=(args[2]||'h').toLowerCase()
      if(user.money<bet) return sock.sendMessage(jid,{text:`❌ No money`})
      const flip=Math.random()<0.5?'h':'t'
      const win=flip===choice
      user.money+= win?bet:-bet; save()
      await sock.sendMessage(jid,{text:`🪙 Flip: ${flip==='h'?'Heads':'Tails'}\n${win?`🎉 WIN $${bet}`:`💸 LOSE $${bet}`}\nBalance: $${user.money}`})
    }
    else if(cmd==='.lb' || cmd==='.leaderboard'){
      let top=Object.entries(data).sort((a,b)=>b[1].money-a[1].money).slice(0,5)
      let txt='🏆 *LEADERBOARD*\n'+top.map((v,i)=>`${i+1}. ${v[0].split('@')[0]} - $${v[1].money}`).join('\n')
      await sock.sendMessage(jid,{text:txt})
    }
    // Echo for any other text to show it's working
    else if(text.toLowerCase()==='hi' || text.toLowerCase()==='hello'){
      await sock.sendMessage(jid,{text:`Hi! 👋 Type .menu for gambling commands`})
    }
  })
}
start()
