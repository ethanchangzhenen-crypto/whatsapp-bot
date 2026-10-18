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

// ===== CONFIG =====
const ADMIN_NUMBERS = ['6581234567'] // <--- CHANGE THIS TO YOUR PHONE NUMBER (without + or @, just number like 6581234567)
const isAdmin = (jid) => {
  return ADMIN_NUMBERS.some(num => jid.includes(num))
}

// ===== ECONOMY =====
const balances = new Map()
const getBal = (id) => { if(!balances.has(id)) balances.set(id, 1000); return balances.get(id) }
const setBal = (id, amt) => balances.set(id, amt)

// ===== PROPERTIES =====
const PROPERTIES = {
  stall: { name: 'Food Stall', emoji: '🍜', price: 5000, income: 300, upgradeCost: 4000 },
  shop: { name: 'Shop', emoji: '🏪', price: 25000, income: 1500, upgradeCost: 20000 },
  casino: { name: 'Mini Casino', emoji: '🎰', price: 100000, income: 7000, upgradeCost: 80000 },
  hotel: { name: 'Hotel', emoji: '🏨', price: 500000, income: 35000, upgradeCost: 400000 },
  mall: { name: 'Mall', emoji: '🏬', price: 2000000, income: 150000, upgradeCost: 1500000 },
}
const userProps = new Map()
const getProps = (jid) => { if(!userProps.has(jid)) userProps.set(jid, {}); return userProps.get(jid) }
const getHourlyIncome = (jid) => {
  let props=getProps(jid), total=0
  for(let id in props) total+= PROPERTIES[id].income * props[id]
  return total
}
setInterval(()=>{
  for(let [jid] of userProps.entries()){
    let inc=getHourlyIncome(jid)
    if(inc>0) setBal(jid, getBal(jid)+inc)
  }
}, 1000*60*60)

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
      const jid=msg.key.remoteJid
      const isGroup = jid.endsWith('@g.us')
      let senderId = msg.key.participant || jid // in groups, participant is real sender
      const raw = msg.message.conversation || msg.message.extendedTextMessage?.text || ''
      if(!raw) return
      const lower=raw.trim().toLowerCase()
      const args=raw.trim().split(/\s+/)
      const isAdminUser = isAdmin(senderId)
      console.log(`GOT: ${raw} | from ${senderId} | admin:${isAdminUser}`)

      // GET TARGET FOR ADMIN COMMANDS (reply to user)
      let targetId = jid
      let mentioned = msg.message.extendedTextMessage?.contextInfo?.mentionedJid?.[0]
      let replied = msg.message.extendedTextMessage?.contextInfo?.participant
      if(mentioned) targetId = mentioned
      else if(replied) targetId = replied
      // if admin types !addmoney 1234 @user, target is mention, else target is the chat jid

      if(lower==='!check'){
        await sock.sendMessage(jid,{text:'✅ Bot Online'})
      } else if(lower.startsWith('!bal')){
        let income=getHourlyIncome(targetId)
        await sock.sendMessage(jid,{text:`💰 Balance: $${getBal(targetId)}\n📈 Hourly: $${income}/hr`})
      
      // ===== NEW FULL MENU =====
      } else if(lower==='!menu'){
        let menu = `🎰 *KAI CASINO MENU* 🎰

*💰 MONEY:*
!bal - check balance + hourly income
!daily - claim $500 free

*🎲 GAMES (any bet amount):*
!slots [amount] - 4 slots
  4 same = 100x | 3 same = 20x
  2 same = 2x | 0 same = lose
!cf [amount] [heads/tails] - coinflip
!dice [amount] [1-6] - guess dice 5x

*🏘️ PROPERTIES (passive income):*
!prop / !properties - shop list
!buy [stall/shop/casino/hotel/mall]
!myprop - your properties
!upgrade [name] - upgrade for more /hr
!collect - income info

*🆘 HELP:*
!menu - this menu
`
        if(isAdminUser){
          menu += `
*👑 ADMIN COMMANDS (only you):*
!addmoney [@user] [amount] - give money
!removemoney [@user] [amount] - take money
!setmoney [@user] [amount] - set exact balance
!reset [@user] - reset player to $1000 + no props
!resetall - reset ALL players
!giveprop [@user] [property] - give free property

Example:
!addmoney @john 50000
or reply to user: !addmoney 10000
`
        }
        await sock.sendMessage(jid,{text:menu})

      // PROPERTIES
      } else if(['!prop','!properties','!shop'].includes(lower)){
        let txt=`🏘️ *PROPERTIES SHOP:*\n\n`
        for(let id in PROPERTIES){
          let p=PROPERTIES[id]
          txt+=`${p.emoji} *${p.name}* - $${p.price}\n   Income: $${p.income}/hr | !buy ${id}\n\n`
        }
        await sock.sendMessage(jid,{text:txt})
      } else if(lower.startsWith('!buy')){
        let id=(args[1]||'').toLowerCase()
        if(!PROPERTIES[id]) return await sock.sendMessage(jid,{text:`❌ Use: stall, shop, casino, hotel, mall`})
        let props=getProps(jid)
        if(props[id]) return await sock.sendMessage(jid,{text:`❌ Already own. !upgrade ${id}`})
        if(getBal(jid)<PROPERTIES[id].price) return await sock.sendMessage(jid,{text:`❌ Need $${PROPERTIES[id].price}`})
        setBal(jid, getBal(jid)-PROPERTIES[id].price)
        props[id]=1
        await sock.sendMessage(jid,{text:`🎉 Bought ${PROPERTIES[id].emoji} ${PROPERTIES[id].name} Lv.1!\n💰 Balance: $${getBal(jid)}`})
      } else if(['!myprop','!myprops'].includes(lower)){
        let props=getProps(jid)
        if(Object.keys(props).length===0) return await sock.sendMessage(jid,{text:`🏚️ No properties. !prop to buy`})
        let txt=`🏘️ *YOUR PROPERTIES:*\n\n`
        let total=0
        for(let id in props){
          let lvl=props[id], p=PROPERTIES[id], inc=p.income*lvl
          total+=inc
          txt+=`${p.emoji} ${p.name} Lv.${lvl} - $${inc}/hr\n   !upgrade ${id} ($${p.upgradeCost*lvl})\n\n`
        }
        txt+=`📈 Total: $${total}/hr\n💰 $${getBal(jid)}`
        await sock.sendMessage(jid,{text:txt})
      } else if(lower.startsWith('!upgrade')){
        let id=(args[1]||'').toLowerCase()
        if(!PROPERTIES[id]) return await sock.sendMessage(jid,{text:`❌ !upgrade stall/shop/casino/hotel/mall`})
        let props=getProps(jid)
        if(!props[id]) return await sock.sendMessage(jid,{text:`❌ Don't own. !buy ${id}`})
        let cost=PROPERTIES[id].upgradeCost*props[id]
        if(getBal(jid)<cost) return await sock.sendMessage(jid,{text:`❌ Need $${cost}`})
        setBal(jid, getBal(jid)-cost)
        props[id]++
        await sock.sendMessage(jid,{text:`⬆️ ${PROPERTIES[id].name} Lv.${props[id]}! Income $${PROPERTIES[id].income*props[id]}/hr\n💰 $${getBal(jid)}`})
      } else if(['!collect','!income'].includes(lower)){
        await sock.sendMessage(jid,{text:`📈 You earn $${getHourlyIncome(jid)}/hr auto. Balance $${getBal(jid)}`})
      
      // ===== ADMIN COMMANDS =====
      } else if(lower.startsWith('!addmoney')){
        if(!isAdminUser) return await sock.sendMessage(jid,{text:`❌ Admin only`})
        let amount = parseInt(args[args.length-1].replace(/[^0-9]/g,''))
        if(mentioned && args.length>=3) amount = parseInt(args[2].replace(/[^0-9]/g,''))
        if(isNaN(amount)) return await sock.sendMessage(jid,{text:`Use: !addmoney [@user] 10000`})
        setBal(targetId, getBal(targetId)+amount)
        await sock.sendMessage(jid,{text:`👑 ADMIN: +$${amount} to ${targetId.split('@')[0]}\nNew balance: $${getBal(targetId)}`})
      
      } else if(lower.startsWith('!removemoney') || lower.startsWith('!takemoney')){
        if(!isAdminUser) return await sock.sendMessage(jid,{text:`❌ Admin only`})
        let amount = parseInt(args[args.length-1].replace(/[^0-9]/g,''))
        if(isNaN(amount)) return await sock.sendMessage(jid,{text:`Use: !removemoney [@user] 1000`})
        setBal(targetId, Math.max(0, getBal(targetId)-amount))
        await sock.sendMessage(jid,{text:`👑 ADMIN: -$${amount} from ${targetId.split('@')[0]}\nNew balance: $${getBal(targetId)}`})
      
      } else if(lower.startsWith('!setmoney')){
        if(!isAdminUser) return await sock.sendMessage(jid,{text:`❌ Admin only`})
        let amount = parseInt(args[args.length-1].replace(/[^0-9]/g,''))
        if(isNaN(amount)) return await sock.sendMessage(jid,{text:`Use: !setmoney [@user] 5000`})
        setBal(targetId, amount)
        await sock.sendMessage(jid,{text:`👑 ADMIN: Set ${targetId.split('@')[0]} to $${amount}`})
      
      } else if(lower.startsWith('!reset')){
        if(!isAdminUser) return await sock.sendMessage(jid,{text:`❌ Admin only`})
        if(lower==='!resetall'){
          balances.clear(); userProps.clear()
          return await sock.sendMessage(jid,{text:`👑 ADMIN: RESET ALL PLAYERS!`})
        }
        // !reset @user
        balances.set(targetId, 1000)
        userProps.set(targetId, {})
        await sock.sendMessage(jid,{text:`👑 ADMIN: Reset ${targetId.split('@')[0]} to $1000 + no properties`})
      
      } else if(lower.startsWith('!giveprop')){
        if(!isAdminUser) return await sock.sendMessage(jid,{text:`❌ Admin only`})
        let propId=(args[2]||args[1]||'').toLowerCase()
        if(args.length>=3) propId=args[2].toLowerCase()
        else propId=args[1].toLowerCase()
        if(!PROPERTIES[propId]) return await sock.sendMessage(jid,{text:`❌ !giveprop [@user] stall`})
        let props=getProps(targetId)
        props[propId]=(props[propId]||0)+1
        await sock.sendMessage(jid,{text:`👑 ADMIN: Gave ${PROPERTIES[propId].name} to ${targetId.split('@')[0]} (Lv.${props[propId]})`})

      // GAMES
      } else if(lower==='!daily'){
        setBal(jid, getBal(jid)+500)
        await sock.sendMessage(jid,{text:`🎁 +$500! $${getBal(jid)}`})
      } else if(lower.startsWith('!slots')){
        let bet = args[1]?parseInt(args[1].replace(/[^0-9]/g,'')):100
        if(isNaN(bet)||bet<=0) bet=100
        if(getBal(jid)<bet) return await sock.sendMessage(jid,{text:`❌ Need $${bet}`})
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
        await sock.sendMessage(jid,{text:`🎰  ${result[0]}  ${result[1]}  ${result[2]}  ${result[3]}  🎰\n${mult>0?`💵 Bet $${bet} | 🎉 WON +$${win} (${outcome} ${mult}x)`: `💵 Bet $${bet} | 💀 LOST -$${win} (${outcome})`}\n💰 Balance: $${getBal(jid)}`})
      } else if(lower.startsWith('!cf')){
        let bet=args[1]?parseInt(args[1].replace(/[^0-9]/g,'')):50
        let choice=(args[2]||'heads').toLowerCase(); if(choice==='h') choice='heads'; if(choice==='t') choice='tails'
        if(getBal(jid)<bet) return await sock.sendMessage(jid,{text:`❌ Need $${bet}`})
        let flip=Math.random()<0.5?'heads':'tails'
        let won=choice===flip
        if(won) setBal(jid,getBal(jid)+bet); else setBal(jid,getBal(jid)-bet)
        await sock.sendMessage(jid,{text:`🎰  🪙  ${flip.toUpperCase()}  🪙  🎰\n💵 Bet $${bet} on ${choice} | ${won?`🎉 WON +$${bet}`:`💀 LOST -$${bet}`}\n💰 Balance: $${getBal(jid)}`})
      } else if(lower.startsWith('!dice')){
        let bet=args[1]?parseInt(args[1].replace(/[^0-9]/g,'')):50
        let guess=parseInt(args[2])||3
        if(getBal(jid)<bet) return await sock.sendMessage(jid,{text:`❌ Need $${bet}`})
        let roll=Math.floor(Math.random()*6)+1
        let won=guess===roll
        if(won) setBal(jid,getBal(jid)+bet*5); else setBal(jid,getBal(jid)-bet)
        await sock.sendMessage(jid,{text:`🎰  🎲  ${roll}  🎲  🎰\n💵 Bet $${bet} on ${guess} | ${won?`🎉 WON +$${bet*5} (5x)`:`💀 LOST -$${bet} (rolled ${roll})`}\n💰 Balance: $${getBal(jid)}`})
      }
    }catch(e){ console.log('Error:', e) }
  })
}
start()
