const { default: makeWASocket, useMultiFileAuthState } = require('@whiskeysockets/baileys')
const P = require('pino')
const express = require('express')
const QR = require('qrcode')
const app = express()
let qrData=''
app.get('/', (req,res)=>{
  if(!qrData) return res.send('BOT CONNECTED ✅')
  res.send(`<center><img src="${qrData}" width="300"><br><button onclick="location.reload()">New QR</button></center>`)
})
app.listen(process.env.PORT||3000)

// --- ECONOMY ---
const balances = new Map()
const getBal = (id) => { if(!balances.has(id)) balances.set(id, 1000); return balances.get(id) }
const setBal = (id, amt) => balances.set(id, amt)

// --- PROPERTIES SYSTEM ---
const PROPERTIES = {
  stall: { name: 'Food Stall', emoji: '🍜', price: 5000, income: 300, upgradeCost: 4000 },
  shop: { name: 'Shop', emoji: '🏪', price: 25000, income: 1500, upgradeCost: 20000 },
  casino: { name: 'Mini Casino', emoji: '🎰', price: 100000, income: 7000, upgradeCost: 80000 },
  hotel: { name: 'Hotel', emoji: '🏨', price: 500000, income: 35000, upgradeCost: 400000 },
  mall: { name: 'Mall', emoji: '🏬', price: 2000000, income: 150000, upgradeCost: 1500000 },
}
const userProps = new Map() // jid -> { stall: level, shop: level ... }
const getProps = (jid) => {
  if(!userProps.has(jid)) userProps.set(jid, {})
  return userProps.get(jid)
}
const getHourlyIncome = (jid) => {
  let props=getProps(jid)
  let total=0
  for(let id in props){
    let lvl=props[id]
    let base=PROPERTIES[id].income
    total+= base * lvl // level 1 = 1x, level 2 = 2x etc
  }
  return total
}

// --- HOURLY PAY LOOP ---
setInterval(()=>{
  console.log('Paying hourly income...')
  for(let [jid, props] of userProps.entries()){
    let income=getHourlyIncome(jid)
    if(income>0){
      setBal(jid, getBal(jid)+income)
      console.log(`Paid ${jid} $${income}`)
    }
  }
}, 1000*60*60) // 1 hour

// For testing, also pay every 5 minutes with smaller amount if you want, comment out the 1 hour above and use below:
// setInterval(()=>{ ... }, 1000*60*5)

async function start(){
  const { state, saveCreds } = await useMultiFileAuthState('auth')
  const sock = makeWASocket({ auth: state, logger: P({level:'silent'}) })
  sock.ev.on('creds.update', saveCreds)
  sock.ev.on('connection.update', async u=>{
    if(u.qr){ qrData=await QR.toDataURL(u.qr); console.log('QR READY') }
    if(u.connection==='open'){ qrData=''; console.log('CONNECTED ✅') }
    if(u.connection==='close'){ setTimeout(start,5000) }
  })
  sock.ev.on('messages.upsert', async m=>{
    try{
      const msg=m.messages[0]
      if(!msg.message) return
      if(msg.key.fromMe) return
      const jid=msg.key.remoteJid
      const raw = msg.message.conversation || msg.message.extendedTextMessage?.text || ''
      if(!raw) return
      console.log('GOT:', raw)
      const lower=raw.trim().toLowerCase()
      const args=raw.trim().split(/\s+/)
      
      if(lower==='!check'){
        await sock.sendMessage(jid,{text:'✅ Bot Online'})
      } else if(lower.startsWith('!bal')){
        let income=getHourlyIncome(jid)
        await sock.sendMessage(jid,{text:`💰 Balance: $${getBal(jid)}\n📈 Hourly Income: $${income}/hr`})
      } else if(lower==='!menu'){
        await sock.sendMessage(jid,{text:`🎰 KAI CASINO
!bal - balance
!daily - $500 free
!slots [amount]
!cf [amount] [heads/tails]
!dice [amount] [1-6]

🏘️ PROPERTIES:
!prop - list properties to buy
!buy [name] - buy property
!myprop - your properties
!upgrade [name] - upgrade (more income)
!collect - collect info`})
      
      // --- PROPERTIES COMMANDS ---
      } else if(lower==='!prop' || lower==='!properties' || lower==='!shop'){
        let txt=`🏘️ PROPERTIES SHOP:\n\n`
        for(let id in PROPERTIES){
          let p=PROPERTIES[id]
          txt+=`${p.emoji} ${p.name} - $${p.price}\n   Income: $${p.income}/hr\n   Buy: !buy ${id}\n\n`
        }
        txt+=`You earn $${getHourlyIncome(jid)}/hr\nUse !myprop to see yours`
        await sock.sendMessage(jid,{text:txt})
      } else if(lower.startsWith('!buy')){
        let id=(args[1]||'').toLowerCase()
        if(!PROPERTIES[id]) return await sock.sendMessage(jid,{text:`❌ Not found. Use: stall, shop, casino, hotel, mall\nExample: !buy stall`})
        let props=getProps(jid)
        if(props[id]) return await sock.sendMessage(jid,{text:`❌ You already own ${PROPERTIES[id].name}. Use !upgrade ${id}`})
        let price=PROPERTIES[id].price
        if(getBal(jid)<price) return await sock.sendMessage(jid,{text:`❌ Need $${price} you have $${getBal(jid)}`})
        setBal(jid, getBal(jid)-price)
        props[id]=1
        await sock.sendMessage(jid,{text:`🎉 Bought ${PROPERTIES[id].emoji} ${PROPERTIES[id].name} Lv.1!\n💵 -$${price}\n📈 +$${PROPERTIES[id].income}/hr\n💰 Balance: $${getBal(jid)}`})
      
      } else if(lower==='!myprop' || lower==='!myprops'){
        let props=getProps(jid)
        if(Object.keys(props).length===0) return await sock.sendMessage(jid,{text:`🏚️ You own nothing. Use !prop to buy`})
        let txt=`🏘️ YOUR PROPERTIES:\n\n`
        let total=0
        for(let id in props){
          let lvl=props[id]
          let p=PROPERTIES[id]
          let inc=p.income*lvl
          total+=inc
          txt+=`${p.emoji} ${p.name} Lv.${lvl} - $${inc}/hr\n   Upgrade: !upgrade ${id} ($${p.upgradeCost*lvl})\n\n`
        }
        txt+=`📈 Total: $${total}/hr\n💰 Balance: $${getBal(jid)}`
        await sock.sendMessage(jid,{text:txt})
      
      } else if(lower.startsWith('!upgrade')){
        let id=(args[1]||'').toLowerCase()
        if(!PROPERTIES[id]) return await sock.sendMessage(jid,{text:`❌ Use: !upgrade stall / shop / casino / hotel / mall`})
        let props=getProps(jid)
        if(!props[id]) return await sock.sendMessage(jid,{text:`❌ You don't own ${PROPERTIES[id].name}. Buy first: !buy ${id}`})
        let lvl=props[id]
        let cost=PROPERTIES[id].upgradeCost * lvl // cost grows with level
        if(getBal(jid)<cost) return await sock.sendMessage(jid,{text:`❌ Upgrade to Lv.${lvl+1} costs $${cost} you have $${getBal(jid)}`})
        setBal(jid, getBal(jid)-cost)
        props[id]=lvl+1
        let newInc=PROPERTIES[id].income*(lvl+1)
        await sock.sendMessage(jid,{text:`⬆️ Upgraded ${PROPERTIES[id].emoji} ${PROPERTIES[id].name} to Lv.${lvl+1}!\n💵 -$${cost}\n📈 New Income: $${newInc}/hr\n💰 Balance: $${getBal(jid)}`})
      
      } else if(lower==='!collect' || lower==='!income'){
        let inc=getHourlyIncome(jid)
        if(inc===0) return await sock.sendMessage(jid,{text:`❌ You have no properties. Buy with !prop`})
        await sock.sendMessage(jid,{text:`📈 You earn $${inc} every hour automatically!\n💰 Current Balance: $${getBal(jid)}\n⏰ Next pay in <60 minutes\nTip: Buy more with !prop or upgrade with !upgrade`})

      // --- GAMES (your 3 layer ones) ---
      } else if(lower==='!daily'){
        setBal(jid, getBal(jid)+500)
        await sock.sendMessage(jid,{text:`🎁 +$500! New: $${getBal(jid)}`})
      } else if(lower.startsWith('!slots')){
        let bet = args[1] ? parseInt(args[1].replace(/[^0-9]/g,'')) : 100
        if(isNaN(bet)||bet<=0) bet=100
        if(bet>1000000) bet=1000000
        if(getBal(jid)<bet) return await sock.sendMessage(jid,{text:`❌ Need $${bet} you have $${getBal(jid)}`})
        let pool=['🍒','🍋','🔔','💎','7️⃣','🍇','🍀']
        const pick=()=>pool[Math.floor(Math.random()*pool.length)]
        const pickDiff=(ex=[])=>{let p;do{p=pick()}while(ex.includes(p));return p}
        let result=[], mult=0, outcome=''
        let roll=Math.random()*100
        if(roll<5){ let e=pick(); result=[e,e,e,e]; outcome='JACKPOT'; mult=100 }
        else if(roll<15){ let e=pick(), o=pickDiff([e]); result=[e,e,e,o].sort(()=>Math.random()-0.5); outcome='TRIPLE'; mult=20 }
        else if(roll<40){ let e=pick(), o1=pickDiff([e]), o2=pickDiff([e,o1]); result=[e,e,o1,o2].sort(()=>Math.random()-0.5); outcome='DOUBLE'; mult=2 }
        else{ while(result.length<4) result.push(pickDiff(result)); outcome='LOSE'; mult=0 }
        let win= mult>0?bet*mult:bet
        if(mult>0) setBal(jid,getBal(jid)+win); else setBal(jid,getBal(jid)-win)
        let top=`🎰  ${result[0]}  ${result[1]}  ${result[2]}  ${result[3]}  🎰`
        let mid= mult>0?`💵 Bet: $${bet} | 🎉 WON: +$${win} (${outcome} ${mult}x)`:`💵 Bet: $${bet} | 💀 LOST: -$${win} (${outcome})`
        await sock.sendMessage(jid,{text:`${top}\n${mid}\n💰 Balance: $${getBal(jid)}`})
      } else if(lower.startsWith('!cf')){
        let bet=args[1]?parseInt(args[1].replace(/[^0-9]/g,'')):50
        if(isNaN(bet)||bet<=0) bet=50
        let choice=(args[2]||'heads').toLowerCase(); if(choice==='h') choice='heads'; if(choice==='t') choice='tails'
        if(getBal(jid)<bet) return await sock.sendMessage(jid,{text:`❌ Need $${bet}`})
        let flip=Math.random()<0.5?'heads':'tails'
        let won=choice===flip
        if(won) setBal(jid,getBal(jid)+bet); else setBal(jid,getBal(jid)-bet)
        await sock.sendMessage(jid,{text:`🎰  🪙  ${flip.toUpperCase()}  🪙  🎰\n💵 Bet: $${bet} on ${choice} | ${won?`🎉 WON: +$${bet}`:`💀 LOST: -$${bet}`}\n💰 Balance: $${getBal(jid)}`})
      } else if(lower.startsWith('!dice')){
        let bet=args[1]?parseInt(args[1].replace(/[^0-9]/g,'')):50
        if(isNaN(bet)||bet<=0) bet=50
        let guess=parseInt(args[2])||3
        if(getBal(jid)<bet) return await sock.sendMessage(jid,{text:`❌ Need $${bet}`})
        let roll=Math.floor(Math.random()*6)+1
        let won=guess===roll
        let winAmt=won?bet*5:bet
        if(won) setBal(jid,getBal(jid)+winAmt); else setBal(jid,getBal(jid)-winAmt)
        await sock.sendMessage(jid,{text:`🎰  🎲  ${roll}  🎲  🎰\n💵 Bet: $${bet} on ${guess} | ${won?`🎉 WON: +$${winAmt} (5x)`:`💀 LOST: -$${winAmt} (rolled ${roll})`}\n💰 Balance: $${getBal(jid)}`})
      }
    }catch(e){ console.log('Error:', e) }
  })
}
start()
