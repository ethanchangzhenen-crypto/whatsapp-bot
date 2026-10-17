const { default: makeWASocket, useMultiFileAuthState } = require('@whiskeysockets/baileys')
const P = require('pino')
const express = require('express')
const QR = require('qrcode')
const fs = require('fs')

const app = express()
let qrData = ''
app.get('/', (req,res)=>{
  if(!qrData) return res.send('<h1>BOT CONNECTED ✅ Use !menu</h1>')
  res.send(`<h1>SCAN QR</h1><img src="${qrData}" width="300"><script>setTimeout(()=>location.reload(),20000)</script>`)
})
app.listen(process.env.PORT||3000)

let data={}
try{ data=JSON.parse(fs.readFileSync('./data.json','utf8')) }catch(e){ data={} }
function save(){ try{fs.writeFileSync('./data.json', JSON.stringify(data))}catch(e){} }
function getUser(id){ if(!data[id]) data[id]={money:1000,lastDaily:0}; return data[id] }

async function start(){
  const { state, saveCreds } = await useMultiFileAuthState('auth3')
  const sock = makeWASocket({ auth: state, logger: P({level:'silent'}), browser: ['Chrome','Bot','1'] })
  sock.ev.on('creds.update', saveCreds)
  sock.ev.on('connection.update', async (u)=>{
    if(u.qr){ qrData=await QR.toDataURL(u.qr) }
    if(u.connection==='open'){ qrData=''; console.log('CONNECTED') }
    if(u.connection==='close'){ setTimeout(start,3000) }
  })
  sock.ev.on('messages.upsert', async (m)=>{
    const msg=m.messages[0]
    if(!msg.message) return
    
    const text = msg.message.conversation || msg.message.extendedTextMessage?.text || msg.message.imageMessage?.caption || ''
    if(!text) return
    console.log('Got message:', text)

    const jid = msg.key.remoteJid
    const isGroup = jid.endsWith('@g.us')
    const senderId = isGroup ? msg.key.participant : jid
    const user = getUser(senderId)

    // SUPPORT BOTH ! and . so !bal and .bal both work
    if(!text.startsWith('!') && !text.startsWith('.')) return

    const args = text.slice(1).trim().split(/ +/)
    const cmd = args[0].toLowerCase()

    if(cmd==='menu' || cmd==='help'){
      await sock.sendMessage(jid,{text:`🎰 *GAMBLING BOT* 🎰\n\n!bal - balance\n!daily - $500 daily\n!slots <bet> - slots\n!cf <bet> h/t - coinflip\n!lb - leaderboard\n\nBalance: $${user.money}`})
    }
    else if(cmd==='bal' || cmd==='balance'){
      await sock.sendMessage(jid,{text:`💰 Balance: $${user.money}`})
    }
    else if(cmd==='daily'){
      const now=Date.now()
      if(now-user.lastDaily<86400000){
        await sock.sendMessage(jid,{text:`⏰ Already claimed, come back later`})
      } else {
        user.money+=500; user.lastDaily=now; save()
        await sock.sendMessage(jid,{text:`✅ +$500 Daily! New: $${user.money}`})
      }
    }
    else if(cmd==='slots' || cmd==='slot'){
      let bet=parseInt(args[1])||100
      if(user.money<bet) return sock.sendMessage(jid,{text:`❌ Need $${bet}, you have $${user.money}`})
      const e=['🍒','🍋','🔔','💎','7️⃣']
      const r=[e[Math.floor(Math.random()*5)], e[Math.floor(Math.random()*5)]]
      let win=0
      if(r[0]===r[1] && r[1]===r[2]) win=bet*5
      else if(r[0]===r[1] || r[1]===r[2] || r[0]===r[2]) win=Math.floor(bet*2)
      user.money=user.money-bet+win; save()
      await sock.sendMessage(jid,{text:`🎰 ${r.join(' | ')}\n${win>0?`🎉 WIN $${win}!`:`💸 LOSE $${bet}`}\nBalance: $${user.money}`})
    }
    else if(cmd==='cf' || cmd==='coinflip'){
      let bet=parseInt(args[1])||100
      let choice=(args[2]||'h')[0].toLowerCase()
      if(user.money<bet) return sock.sendMessage(jid,{text:`❌ No money`})
      const flip=Math.random()<0.5?'h':'t'
      const won=flip===choice
      user.money+= won?bet:-bet; save()
      await sock.sendMessage(jid,{text:`🪙 ${flip==='h'?'Heads':'Tails'}!\n${won?`🎉 WIN $${bet}`:`💸 LOSE $${bet}`}\nBalance: $${user.money}`})
    }
    else if(cmd==='lb'){
      let top=Object.entries(data).sort((a,b)=>b[1].money-a[1].money).slice(0,5)
      let txt='🏆 LEADERBOARD\n'+top.map((v,i)=>`${i+1}. ${v[0].split('@')[0]} - $${v[1].money}`).join('\n')
      await sock.sendMessage(jid,{text:txt})
    }
  })
}
start()
