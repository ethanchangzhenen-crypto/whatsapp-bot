const { default: makeWASocket, useMultiFileAuthState } = require('@whiskeysockets/baileys')
const P = require('pino')
const express = require('express')
const QR = require('qrcode')
const app = express()
let qrData=''
app.get('/', (req,res)=>{ if(!qrData) return res.send('BOT CONNECTED ✅ Send !check'); res.send(`<center><h2>Scan QR</h2><img src="${qrData}"></center>`) })
app.listen(process.env.PORT||3000)

const balances = new Map()
const getBal = (id) => { if(!balances.has(id)) balances.set(id, 1000); return balances.get(id) }
const setBal = (id, amt) => balances.set(id, amt)

async function start(){
  const { state, saveCreds } = await useMultiFileAuthState('auth3')
  const sock = makeWASocket({ auth: state, logger: P({level:'silent'}), browser: ['Chrome','Bot','1'] })
  sock.ev.on('creds.update', saveCreds)
  sock.ev.on('connection.update', async u=>{
    if(u.qr){ qrData=await QR.toDataURL(u.qr); console.log('QR READY') }
    if(u.connection==='open'){ qrData=''; console.log('CONNECTED') }
    if(u.connection==='close') setTimeout(start,3000)
  })
  sock.ev.on('messages.upsert', async m=>{
    try{
      const msg=m.messages[0]
      if(!msg.message) return
      const text = msg.message.conversation || msg.message.extendedTextMessage?.text || msg.message.imageMessage?.caption || ''
      if(!text) return
      const jid=msg.key.remoteJid
      console.log('RECEIVED:', text)

      let t=text.trim()
      if(!t.startsWith('!') && !t.startsWith('.')) return
      t=t.slice(1).toLowerCase()
      const args=t.split(' ')
      const cmd=args[0]
      const bal=getBal(jid)

      // NEW CHECK COMMAND
      if(cmd==='check'){
        await sock.sendMessage(jid,{text:`✅ Bot Online`})
      }
      else if(cmd==='menu' || cmd==='help'){
        await sock.sendMessage(jid,{text:`🎰 *GAMBLING BOT* 🎰

💰 Economy:
!bal - check balance
!check - check if bot online
!daily - daily $500

🎲 Games:
!slots 100
!cf 100 heads
!dice 100`})
      }
      else if(cmd==='bal'){
        await sock.sendMessage(jid,{text:`💰 Balance: $${bal}`})
      }
      else if(cmd==='daily'){
        setBal(jid, bal+500)
        await sock.sendMessage(jid,{text:`✅ Daily +$500\nBalance: $${getBal(jid)}`})
      }
      else if(cmd==='slots'){
        let bet=parseInt(args[1])||100
        if(bal<bet) return sock.sendMessage(jid,{text:`❌ Need $${bet}, you have $${bal}`})
        const e=['🍒','🍋','💎','7️⃣','🍀']
        const r=[e[Math.floor(Math.random()*5)],e[Math.floor(Math.random()*5)]]
        let win=0
        if(r[0]===r[1] && r[1]===r[2]) win=bet*5
        else if(r[0]===r[1] || r[1]===r[2]) win=bet*2
        if(win>0) setBal(jid, bal-bet+win); else setBal(jid, bal-bet)
        await sock.sendMessage(jid,{text:`🎰 | ${r.join(' | ')} |\n${win>0?`🎉 WIN $${win}!`:`💸 Lost $${bet}`}\nBalance: $${getBal(jid)}`})
      }
      else if(cmd==='cf'){
        let bet=parseInt(args[1])||100
        let choice=(args[2]||'heads').toLowerCase()
        if(bal<bet) return sock.sendMessage(jid,{text:`❌ No money`})
        const res=Math.random()<0.5?'heads':'tails'
        if(res===choice){ setBal(jid, bal+bet); await sock.sendMessage(jid,{text:`🪙 ${res} - WIN $${bet}!\nBal: $${getBal(jid)}`}) }
        else{ setBal(jid, bal-bet); await sock.sendMessage(jid,{text:`🪙 ${res} - LOSE $${bet}\nBal: $${getBal(jid)}`}) }
      }
      else if(cmd==='dice'){
        let bet=parseInt(args[1])||100
        if(bal<bet) return sock.sendMessage(jid,{text:`❌ No money`})
        const bot=Math.floor(Math.random()*6)+1, me=Math.floor(Math.random()*6)+1
        if(me>bot){ setBal(jid, bal+bet); await sock.sendMessage(jid,{text:`🎲 You ${me} vs Bot ${bot} - WIN $${bet}! Bal: $${getBal(jid)}`}) }
        else if(me<bot){ setBal(jid, bal-bet); await sock.sendMessage(jid,{text:`🎲 You ${me} vs Bot ${bot} - LOSE $${bet} Bal: $${getBal(jid)}`}) }
        else await sock.sendMessage(jid,{text:`🎲 You ${me} vs Bot ${bot} - TIE`})
      }
    }catch(e){ console.log('ERR:', e) }
  })
}
start()
