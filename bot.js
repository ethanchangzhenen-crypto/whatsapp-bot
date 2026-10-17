const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, Browsers } = require('@whiskeysockets/baileys')
const P = require('pino')
const express = require('express')
const app = express()
let latestQR=''
app.get('/', (req,res)=>{
  if(!latestQR) return res.send('<h1>GAMBLING BOT ONLINE ✅</h1><p>Commands: .menu .bal .slots 100 .shop .buy .give .reset</p>')
  res.send(`<h1>SCAN QR</h1><img src="${latestQR}" style="width:350px"><script>setTimeout(()=>location.reload(),20000),20000</script>`)
})
app.listen(process.env.PORT||3000)

const CONFIG={ ownerNumber:"6597306863", prefix:".", startingMoney:1000, daily:500 }
const PROPERTIES={ house:5000, hotel:15000, casino:50000, mansion:100000, island:500000 }
let db={}
function getUser(id){ if(!db[id]) db[id]={money:CONFIG.startingMoney, props:[], lastDaily:0}; return db[id] }

async function startBot(){
  const { state, saveCreds } = await useMultiFileAuthState('auth2') // FIXED - NO MORE BAD MAC
  const sock = makeWASocket({ auth: state, logger: P({level:'silent'}), browser: Browsers.ubuntu('Chrome') })
  sock.ev.on('creds.update', saveCreds)
  sock.ev.on('connection.update', async (u)=>{
    const {connection, lastDisconnect, qr} = u
    if(qr){ latestQR = await require('qrcode').toDataURL(qr) }
    if(connection==='close'){ const c=lastDisconnect?.error?.output?.statusCode; if(c!==DisconnectReason.loggedOut) startBot() }
    else if(connection==='open'){ latestQR=''; console.log('GAMBLING BOT READY') }
  })

  sock.ev.on('messages.upsert', async (m)=>{
    try{
      const msg=m.messages[0]; if(!msg.message || msg.key.fromMe) return
      let text=msg.message.conversation || msg.message.extendedTextMessage?.text || msg.message.imageMessage?.caption || ""
      if(!text.startsWith(CONFIG.prefix)) return
      const jid=msg.key.remoteJid
      const senderId=jid.endsWith('@g.us') ? msg.key.participant : jid
      const parts=text.slice(1).trim().split(/ +/)
      const cmd=parts[0].toLowerCase()
      const args=parts.slice(1)
      const user=getUser(senderId)
      const isOwner=senderId.includes(CONFIG.ownerNumber)

      if(cmd==='bal' || cmd==='balance' || cmd==='money'){
        await sock.sendMessage(jid, {text:`💰 *BALANCE*\n\nMoney: $${user.money}\nProperties: ${user.props.join(', ')||'None'}\n\nDaily: .daily\nSlots: .slots 100`})
      }
      else if(cmd==='menu' || cmd==='help'){
        await sock.sendMessage(jid, {text:`🎰 *GAMBLING BOT MENU*\n\n💰 PLAYER:\n.bal - balance\n.daily - free $${CONFIG.daily} (24h)\n.slots 100 - play slots\n.shop - see properties\n.buy house - buy property\n.top - leaderboard\n\n👑 ADMIN ONLY:\n.give @user 1000 - give money\n.reset @user - reset player\n.setmoney @user 5000\n\nProperties:\nhouse $5k, hotel $15k, casino $50k, mansion $100k, island $500k`})
      }
      else if(cmd==='daily'){
        const now=Date.now()
        if(now-user.lastDaily < 86400000){ const h=Math.ceil((86400000-(now-user.lastDaily))/3600000); return sock.sendMessage(jid, {text:`⏳ Already claimed! Wait ${h}h`}) }
        user.lastDaily=now; user.money+=CONFIG.daily
        await sock.sendMessage(jid, {text:`✅ Daily +$${CONFIG.daily}!\nBalance: $${user.money}`})
      }
      else if(cmd==='slots' || cmd==='slot'){
        const bet=parseInt(args[0])||100
        if(bet<=0) return sock.sendMessage(jid, {text:`Use: .slots 100`})
        if(user.money<bet) return sock.sendMessage(jid, {text:`❌ You need $${bet}, you have $${user.money}`})
        const sym=['🍒','🍋','🍊','💎','7️⃣','🍀']
        const r=[sym[Math.floor(Math.random()*6)], sym[Math.floor(Math.random()*6)], sym[Math.floor(Math.random()*6)]]
        let win=0; if(r[0]===r[1] && r[1]===r[2]) win = (r[0]==='💎'||r[0]==='7️⃣') ? bet*10 : bet*5
        else if(r[0]===r[1] || r[1]===r[2] || r[0]===r[2]) win=bet*2
        if(win>0){ user.money+=win; await sock.sendMessage(jid, {text:`🎰 [ ${r[0]} | ${r[1]} | ${r[2]} ]\n\n🎉 WIN $${win}!\nBalance: $${user.money}`}) }
        else { user.money-=bet; await sock.sendMessage(jid, {text:`🎰 [ ${r[0]} | ${r[1]} | ${r[2]} ]\n\n💸 LOSE $${bet}\nBalance: $${user.money}`}) }
      }
      else if(cmd==='shop'){
        let t=`🏪 *PROPERTY SHOP*\n\n`; for(let k in PROPERTIES) t+=`• *${k}* - $${PROPERTIES[k]}\n`; t+=`\nBuy: .buy house`; await sock.sendMessage(jid, {text:t})
      }
      else if(cmd==='buy'){
        const p=(args[0]||'').toLowerCase(); if(!PROPERTIES[p]) return sock.sendMessage(jid, {text:`❌ No property. Use .shop`})
        if(user.money<PROPERTIES[p]) return sock.sendMessage(jid, {text:`❌ Need $${PROPERTIES[p]}, you have $${user.money}`})
        user.money-=PROPERTIES[p]; user.props.push(p); await sock.sendMessage(jid, {text:`✅ Bought *${p}* for $${PROPERTIES[p]}!\nBalance: $${user.money}`})
      }
      else if(cmd==='top' || cmd==='lb' || cmd==='leaderboard'){
        let sorted=Object.entries(db).sort((a,b)=>b[1].money-a[1].money).slice(0,10)
        let t=`🏆 *TOP 10 RICH*\n\n`; sorted.forEach(([id,u],i)=>{ t+=`${i+1}. ${id.split('@')[0]} - $${u.money}\n` }); await sock.sendMessage(jid, {text:t})
      }
      else if(cmd==='give' || cmd==='addmoney'){
        if(!isOwner) return sock.sendMessage(jid, {text:`❌ Admin only`})
        const target=msg.message.extendedTextMessage?.contextInfo?.mentionedJid?.[0]
        const amount=parseInt(args[1])||parseInt(args[0])||0
        if(!target || !amount) return sock.sendMessage(jid, {text:`Use: .give @user 1000`})
        getUser(target).money+=amount; await sock.sendMessage(jid, {text:`✅ Gave $${amount} to @${target.split('@')[0]}\nNew: $${getUser(target).money}`, mentions:[target]})
      }
      else if(cmd==='reset'){
        if(!isOwner) return sock.sendMessage(jid, {text:`❌ Admin only`})
        const target=msg.message.extendedTextMessage?.contextInfo?.mentionedJid?.[0]
        if(!target) return sock.sendMessage(jid, {text:`Use: .reset @user`})
        db[target]={money:CONFIG.startingMoney, props:[], lastDaily:0}; await sock.sendMessage(jid, {text:`🔄 Reset @${target.split('@')[0]} to $${CONFIG.startingMoney}`, mentions:[target]})
      }
      else if(cmd==='setmoney'){
        if(!isOwner) return
        const target=msg.message.extendedTextMessage?.contextInfo?.mentionedJid?.[0] || senderId
        const amount=parseInt(args[1]||args[0]); if(isNaN(amount)) return
        getUser(target).money=amount; await sock.sendMessage(jid, {text:`✅ Set $${amount} for @${target.split('@')[0]}`, mentions:[target]})
      }
    }catch(e){ console.log('Error:', e.message) }
  })
}
startBot()
