const { default: makeWASocket, useMultiFileAuthState } = require('@whiskeysockets/baileys')
const P = require('pino')
const qrcode = require('qrcode-terminal')
const fs = require('fs')
const express = require('express')
const QRCode = require('qrcode')

// ===== WEB SERVER FOR QR ON DOMAIN =====
const app = express()
let currentQR = null
let isConnected = false

app.get('/', async (req, res) => {
  if (isConnected) {
    res.send(`<html><body style="font-family:Arial;text-align:center;padding:50px;background:#000;color:#0f0"><h1>✅ Bot Connected!</h1><p>Bot is online and working! Use !menu in WhatsApp</p><p>Features: slots, cf, dice, farm, crops, pet, fish, hunt LVL1-10, properties, stocks, race, qr</p></body></html>`)
  } else if (currentQR) {
    try {
      let qrImage = await QRCode.toDataURL(currentQR)
      res.send(`
        <html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Scan WhatsApp QR</title></head>
        <body style="font-family:Arial;text-align:center;padding:20px;background:#111;color:white">
          <h1>📱 SCAN THIS QR TO LINK WHATSAPP</h1>
          <p>WhatsApp > Settings > Linked Devices > Link a Device > Scan</p>
          <img src="${qrImage}" style="width:350px;height:350px;background:white;padding:20px;border-radius:20px;margin:20px">
          <p style="color:yellow">QR expires in 30 sec - Page auto reloads</p>
          <p>Domain: ion-490d.up.railway.app</p>
          <script>setTimeout(()=>location.reload(),25000)</script>
        </body></html>
      `)
    } catch (e) { res.send('Generating QR... reload in 5 sec<script>setTimeout(()=>location.reload(),3000)</script>') }
  } else {
    res.send('<h1>⏳ Starting bot... Wait 10 sec then reload</h1><script>setTimeout(()=>location.reload(),5000)</script>')
  }
})
const PORT = process.env.PORT || 3000
app.listen(PORT, () => console.log(`Web server on ${PORT}`))

// ===== DATABASE NO NATIVE MODULES =====
let db = {}
try { db = JSON.parse(fs.readFileSync('./database.json')) } catch { db = {} }
function saveDB(){ fs.writeFileSync('./database.json', JSON.stringify(db, null, 2)) }
function getDB(k,d){ return db[k]!==undefined?db[k]:d }
function setDB(k,v){ db[k]=v; saveDB(); }
function addDB(k,v){ db[k]=(db[k]||0)+v; saveDB(); return db[k] }

const challenges = {
  monday: { name: "Gambling", goal: 20, unit: "gambles", reward: "$2000" },
  tuesday: { name: "Farm Easy", goal: 10000, unit: "$ farmed", reward: "2x Farm" },
  wednesday: { name: "Farm Hard", goal: 25000, unit: "$ farmed", reward: "$5000" },
  thursday: { name: "Pet Care", goal: 100, unit: "% happiness", reward: "Pet EXP" },
  friday: { name: "Fishing Frenzy", goal: 200, unit: "fish", reward: "$3000" },
  saturday: { name: "GC Hunt", goal: 150, unit: "monsters", reward: "500 EXP EACH", shared: true },
  sunday: { name: "GC Race Day", goal: 5, unit: "races", reward: "RESET TONIGHT", shared: true }
}
function getToday(){const d=['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];return d[new Date().getDay()];}
function makeBar(c,g){let p=Math.min(Math.floor(c/g*100),100);let f=Math.floor(p/10);return `[${"█".repeat(f)}${"░".repeat(10-f)}] ${p}%`;}
function footer(){let day=getToday();let Day=day.charAt(0).toUpperCase()+day.slice(1);return `\n\nRemember to do your ${Day} challenge! Use !challenge to see it!`;}
function getLevelBoost(l){return 1+(l*0.15);}

async function startBot(){
  const { state, saveCreds } = await useMultiFileAuthState('./auth')
  const sock = makeWASocket({ auth: state, logger: P({level: 'silent'}) })
  sock.ev.on('creds.update', saveCreds)

  sock.ev.on('connection.update', (update) => {
    const { connection, qr } = update
    if(qr){
      currentQR = qr
      console.log('QR READY ON DOMAIN!')
      qrcode.generate(qr, {small: true})
    }
    if(connection === 'open'){ isConnected = true; currentQR = null; console.log('✅ Connected!') }
    if(connection === 'close'){ isConnected = false; console.log('Reconnect...'); setTimeout(startBot,3000) }
  })

  sock.ev.on('messages.upsert', async ({ messages }) => {
    const msg = messages[0]
    if(!msg.message || msg.key.fromMe) return
    const text = msg.message.conversation || msg.message.extendedTextMessage?.text || ""
    if(!text.startsWith('!')) return
    const from = msg.key.remoteJid
    const args = text.slice(1).trim().split(/ +/)
    const command = args.shift().toLowerCase()
    const userId = msg.key.participant || from
    let balance = getDB(`money_${userId}`, 1000)
    let level = getDB(`level_${userId}`, 1)
    let exp = getDB(`exp_${userId}`, 0)
    let fishInv = getDB(`fish_${userId}`, 0)
    let today = getToday()
    const send = async (txt) => { await sock.sendMessage(from, { text: txt + footer() }, { quoted: msg }) }

    // ===== !MENU FULL =====
    if(command==='menu'||command==='help'){
      let prog=getDB(`challenge_${today}`,0); let personal=getDB(`challenge_${userId}_${today}`,0)
      let useProg=challenges[today].shared?prog:personal; let bar=makeBar(useProg,challenges[today].goal)
      await sock.sendMessage(from, { text: `💰 *ECONOMY RPG - FULL MENU*
📅 TODAY: ${today.toUpperCase()} - ${challenges[today].name} ${bar} ${useProg}/${challenges[today].goal}

🎰 *GAMBLING:*
!cf <heads/tails> <bet> - Coinflip
!slots <bet> - Slots 5x win
!dice <1-6> <bet> - Dice 3x win

🌾 *FARMING:*
!farm - Farm $250 + boost
!crops - Check crops
!crops plant <wheat/corn> - Plant
!sell - Sell crops

🐾 *PET SYSTEM:*
!pet - View pet
!pet feed - +20% happy
!pet play - +15% happy
!pet buy <dog/cat/dragon>

🎣 *FISHING:*
!fish - Fish (Friday challenge)
!fish sell - Sell all fish $50 each
!fish inv - Inventory

👹 *HUNTING LVL1-10:*
!hunt - Hunt monsters + EXP
!level - Check LVL1-10 Boost
!leaderboard - Top

🏠 *PROPERTIES:*
!properties - View shop
!buy <house/mansion/hotel>
!buy house - $10k
!buy mansion - $50k
!buy hotel - $100k

📈 *STOCKS:*
!stocks - View market
!stocks buy <TSLA/AAPL/BTC> <amount>
!stocks sell <symbol> <amount>
!stocks portfolio - Your stocks

🏁 *RACE (SUNDAY GC):*
!race - Start race
!race join - Join

📱 *QR CODE:*
!qr <text/link> - Generate scannable QR image

💵 *OTHER:*
!balance / !bal - Check money
!daily - Daily $1000
!inventory / !inv - Your items
!challenge - Daily challenge progress

Your Balance: $${balance} | LVL: ${level} (${getLevelBoost(level).toFixed(1)}x boost)
${footer()}` }, { quoted: msg })
    }

    // ===== !CHALLENGE REAL TIME BAR =====
    if(command==='challenge'){
      let prog=getDB(`challenge_${today}`,0); let personal=getDB(`challenge_${userId}_${today}`,0)
      let chal=challenges[today]; let useProg=chal.shared?prog:personal; let bar=makeBar(useProg,chal.goal)
      let need=chal.goal-useProg
      await send(`📅 *${today.toUpperCase()} CHALLENGE: ${chal.name.toUpperCase()}*
━━━━━━━━━━━━━━━
Goal: ${chal.goal} ${chal.unit}
Progress: ${useProg}/${chal.goal}
${bar}

${need>0?`Need ${need} more ${chal.unit}!`:`✅ COMPLETED! Reward: ${chal.reward}`}
Reward: ${chal.reward}
GC TOTAL: ${prog}/150
Your TOTAL: ${personal}
LVL1-8 Bar: ${bar}`)
    }

    if(command==='balance'||command==='bal'){ await send(`💵 *Balance:* $${balance}\n📊 *LVL:* ${level} | Boost: ${getLevelBoost(level)}x more money\n⭐ EXP: ${exp}/1000 ${makeBar(exp,1000)}`) }
    if(command==='level'){ await send(`📈 *Level System LVL1-10*\nLevel: ${level}\nEXP: ${exp}/1000 ${makeBar(exp,1000)}\nBoost: ${getLevelBoost(level)}x (+${Math.floor((getLevelBoost(level)-1)*100)}%)\nLVL10 = 2.5x Money!`) }
    if(command==='leaderboard'){ let all=Object.keys(db).filter(k=>k.startsWith('money_')).sort((a,b)=>db[b]-db[a]).slice(0,5); let txt=all.map((k,i)=>`${i+1}. ${k.replace('money_','').slice(0,8)}: $${db[k]}`).join('\n'); await send(`🏆 *Leaderboard*\n${txt||'No data yet'}`) }

    // ===== !QR GENERATES REAL QR IMAGE =====
    if(command==='qr'){
      let link=args.join(" "); if(!link) return send(`📱 Use: !qr <text or link>\nExample: !qr https://discord.gg/xyz`)
      let qrUrl=`https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(link)}`
      await sock.sendMessage(from, { image: { url: qrUrl }, caption: `📱 *QR CODE*\nLink: ${link}\nScan to open!`+footer() }, { quoted: msg })
    }

    // ===== GAMBLING =====
    if(command==='cf'){
      let choice=args[0]; let bet=parseInt(args[1])||100; if(!choice) return send(`Use: !cf <heads/tails> <bet>`); if(balance<bet) return send(`No money! Balance $${balance}`)
      let result=Math.random()>0.5?"heads":"tails"
      if(choice===result){ let win=Math.floor(bet*getLevelBoost(level)); addDB(`money_${userId}`,win); addDB(`challenge_${today}`,1); addDB(`challenge_${userId}_${today}`,1); await send(`🪙 CF: ${result.toUpperCase()}! WIN +$${win} | ${makeBar(getDB(`challenge_${userId}_${today}`,0),20)}`) }
      else{ addDB(`money_${userId}`,-bet); await send(`🪙 CF: ${result.toUpperCase()}! LOSE -$${bet}`) }
    }
    if(command==='slots'){
      let bet=parseInt(args[0])||100; if(balance<bet) return send(`No money!`)
      let slots=["🍒","🍋","💎","7️⃣","🍀"]; let s1=slots[Math.floor(Math.random()*slots.length)], s2=slots[Math.floor(Math.random()*slots.length)], s3=slots[Math.floor(Math.random()*slots.length)]
      if(s1===s2&&s2===s3){ let win=Math.floor(bet*5*getLevelBoost(level)); addDB(`money_${userId}`,win); addDB(`challenge_${today}`,1); addDB(`challenge_${userId}_${today}`,1); await send(`🎰 [ ${s1} | ${s2} | ${s3} ] JACKPOT! +$${win}`) }
      else{ addDB(`money_${userId}`,-bet); await send(`🎰 [ ${s1} | ${s2} | ${s3} ] LOSE -$${bet}`) }
    }
    if(command==='dice'){
      let guess=parseInt(args[0]); let bet=parseInt(args[1])||100; if(isNaN(guess)) return send(`Use: !dice <1-6> <bet>`)
      let roll=Math.floor(Math.random()*6)+1
      if(guess===roll){ let win=bet*3; addDB(`money_${userId}`,win); await send(`🎲 Rolled ${roll}! You guessed ${guess} WIN +$${win}`) }
      else{ addDB(`money_${userId}`,-bet); await send(`🎲 Rolled ${roll}! You guessed ${guess} LOSE -$${bet}`) }
    }
    if(command==='gamble'){ let bet=parseInt(args[0])||100; if(Math.random()>0.5){ addDB(`money_${userId}`,bet); await send(`🎲 Gamble WIN +$${bet}`) } else { addDB(`money_${userId}`,-bet); await send(`🎲 Gamble LOSE -$${bet}`) } }

    // ===== FARMING =====
    if(command==='farm'||command==='crops'){
      if(args[0]==='plant'){ let type=args[1]||'wheat'; setDB(`crop_${userId}`,{type,time:Date.now()}); return send(`🌱 Planted ${type}! Harvest in 5 mins with !farm`) }
      if(args[0]==='sell'){ let crop=getDB(`crop_${userId}`,null); if(!crop) return send(`No crops planted! Use !crops plant wheat`); let val=Math.floor(500*getBoost(level)); addDB(`money_${userId}`,val); setDB(`crop_${userId}`,null); return send(`🌾 Sold ${crop.type} for $${val}`) }
      let earned=Math.floor(250*getLevelBoost(level)); addDB(`money_${userId}`,earned); addDB(`challenge_${today}`,earned); addDB(`challenge_${userId}_${today}`,earned)
      await send(`🌾 Farmed +$${earned} | Boost: ${getLevelBoost(level)}x | Challenge: ${getDB(`challenge_${userId}_${today}`,0)}/${challenges[today].goal}`)
    }

    // ===== PET =====
    if(command==='pet'){
      let happy=getDB(`pet_happy_${userId}`,100); let petName=getDB(`pet_${userId}`,'none')
      if(args[0]==='feed'){ let nh=Math.min(100,happy+20); setDB(`pet_happy_${userId}`,nh); addDB(`challenge_${today}`,20); return send(`🐶 Fed ${petName}! Happiness: ${nh}% ${makeBar(nh,100)}`) }
      if(args[0]==='play'){ let nh=Math.min(100,happy+15); setDB(`pet_happy_${userId}`,nh); addDB(`challenge_${today}`,15); return send(`🐶 Played with ${petName}! Happiness: ${nh}% ${makeBar(nh,100)}`) }
      if(args[0]==='buy'){ let name=args[1]||'dog'; setDB(`pet_${userId}`,name); setDB(`pet_happy_${userId}`,100); return send(`🐾 Bought pet: ${name}! Happiness 100%`) }
      await send(`🐾 Pet: ${petName}\nHappiness: ${happy}% ${makeBar(happy,100)}\n!pet feed / !pet play / !pet buy <name>`)
    }

    // ===== FISH =====
    if(command==='fish'){
      if(args[0]==='sell'){ let f=getDB(`fish_${userId}`,0); if(f==0) return send(`No fish! Use !fish to catch`); let sell=f*50; setDB(`fish_${userId}`,0); addDB(`money_${userId}`,sell); return send(`🎣 Sold ${f} fish for $${sell} ($50 each)`) }
      if(args[0]==='inv'||args[0]==='inventory'){ return send(`🎣 Fish Inventory: ${fishInv} fish\nValue: $${fishInv*50}`) }
      addDB(`fish_${userId}`,1); addDB(`challenge_${today}`,1); addDB(`challenge_${userId}_${today}`,1)
      let nf=getDB(`fish_${userId}`,1); await send(`🎣 Caught 1 fish! Total: ${nf} ${today==='friday'?makeBar(nf,200):''}\n${today==='friday'?`Friday Challenge: ${nf}/200`:`Use !fish sell to sell`}`)
    }

    // ===== HUNT LVL1-10 =====
    if(command==='hunt'){
      let monsters=["Goblin (10 XP)","Orc (20 XP)","Dragon (50 XP)","Slime (5 XP)","Demon (100 XP)"]; let m=monsters[Math.floor(Math.random()*monsters.length)]
      let earn=Math.floor((100+Math.random()*200)*getLevelBoost(level)); let expGain=50
      addDB(`money_${userId}`,earn); addDB(`exp_${userId}`,expGain); addDB(`challenge_${today}`,1); addDB(`challenge_${userId}_${today}`,1)
      let newExp=getDB(`exp_${userId}`,0)
      if(newExp>=1000&&level<10){ addDB(`level_${userId}`,1); setDB(`exp_${userId}`,0); return send(`👹 Killed ${m}! +$${earn} +${expGain} EXP\n🎉 LEVEL UP! Now LVL${level+1} Boost: ${getLevelBoost(level+1)}x\n${makeBar(0,1000)}`) }
      await send(`👹 Killed ${m}! +$${earn} +${expGain} EXP\nLVL ${level} EXP ${newExp}/1000 ${makeBar(newExp,1000)}`)
    }

    // ===== PROPERTIES =====
    if(command==='properties'||command==='buy'){
      let props={house:10000,mansion:50000,hotel:100000}; let rents={house:500,mansion:3000,hotel:7000}
      if(command==='buy'){ let type=args[0]?.toLowerCase(); if(!props[type]) return send(`🏠 Buy: !buy house $10k | !buy mansion $50k | !buy hotel $100k`); if(balance<props[type]) return send(`Need $${props[type]} Have $${balance}`); addDB(`money_${userId}`,-props[type]); addDB(`prop_${userId}_${type}`,1); return send(`🏠 Bought ${type} for $${props[type]}! Rent: $${rents[type]}/day | Use !properties collect`) }
      if(args[0]==='collect'){ let h=getDB(`prop_${userId}_house`,0),m=getDB(`prop_${userId}_mansion`,0),ht=getDB(`prop_${userId}_hotel`,0); let total=h*rents.house+m*rents.mansion+ht*rents.hotel; if(total==0) return send(`No properties! Buy first`); addDB(`money_${userId}`,total); return send(`🏠 Collected rent! +$${total}\nHouses:${h} Mansions:${m} Hotels:${ht}`) }
      let uh=getDB(`prop_${userId}_house`,0),um=getDB(`prop_${userId}_mansion`,0),uht=getDB(`prop_${userId}_hotel`,0)
      await send(`🏠 *Properties Shop*\nHouse - $10,000 - Rent $500/day - You: ${uh}\nMansion - $50,000 - Rent $3000/day - You: ${um}\nHotel - $100,000 - Rent $7000/day - You: ${uht}\n\n!buy <type> to buy\n!properties collect to collect rent\nTotal value: $${uh*10000+um*50000+uht*100000}`)
    }

    // ===== STOCKS =====
    if(command==='stocks'){
      let stocks={TSLA:200,AAPL:150,BTC:500,ETH:300,DOGE:50}
      if(args[0]==='buy'){ let sym=args[1]?.toUpperCase(); let amt=parseInt(args[2])||1; if(!stocks[sym]) return send(`📈 Stocks: TSLA $200 AAPL $150 BTC $500 ETH $300 DOGE $50`); let cost=stocks[sym]*amt; if(balance<cost) return send(`Need $${cost} Have $${balance}`); addDB(`money_${userId}`,-cost); addDB(`stock_${userId}_${sym}`,amt); return send(`📈 Bought ${amt}x ${sym} for $${cost}\nPortfolio: !stocks portfolio`) }
      if(args[0]==='sell'){ let sym=args[1]?.toUpperCase(); let amt=parseInt(args[2])||1; let owned=getDB(`stock_${userId}_${sym}`,0); if(owned<amt) return send(`You only own ${owned}x ${sym}`); let gain=stocks[sym]*amt; addDB(`stock_${userId}_${sym}`,-amt); addDB(`money_${userId}`,gain); return send(`📈 Sold ${amt}x ${sym} for $${gain}`) }
      if(args[0]==='portfolio'||args[0]==='p'){ let t=getDB(`stock_${userId}_TSLA`,0),a=getDB(`stock_${userId}_AAPL`,0),b=getDB(`stock_${userId}_BTC`,0),e=getDB(`stock_${userId}_ETH`,0),d=getDB(`stock_${userId}_DOGE`,0); let val=t*200+a*150+b*500+e*300+d*50; return send(`📈 *Portfolio*\nTSLA: ${t}x\nAAPL: ${a}x\nBTC: ${b}x\nETH: ${e}x\nDOGE: ${d}x\nTotal value: $${val}`) }
      await send(`📈 *Stocks Market*\nTSLA: $200\nAAPL: $150\nBTC: $500\nETH: $300\nDOGE: $50\n\n!stocks buy <symbol> <amount>\n!stocks sell <symbol> <amount>\n!stocks portfolio`)
    }

    // ===== RACE =====
    if(command==='race'){
      if(args[0]==='join'){ addDB(`challenge_${today}`,1); addDB(`challenge_${userId}_${today}`,1); let gc=getDB(`challenge_${today}`,0); return send(`🏁 Joined GC Race! GC Races: ${gc}/5 ${makeBar(gc,5)}`) }
      addDB(`challenge_${today}`,1); addDB(`challenge_${userId}_${today}`,1)
      let gcProg=getDB(`challenge_${today}`,0); await send(`🏁 Race finished! You won! GC Races: ${gcProg}/5 ${makeBar(gcProg,5)}\n${today==='sunday'?`Sunday Challenge: ${gcProg}/5`:`Today: ${today}`}`)
    }

    if(command==='daily'){ let last=getDB(`daily_${userId}`,0); if(Date.now()-last<86400000) return send(`⏰ Daily already claimed! Wait ${Math.floor((86400000-(Date.now()-last))/3600000)}h ${Math.floor(((86400000-(Date.now()-last))%3600000)/60000)}m`); addDB(`money_${userId}`,1000); setDB(`daily_${userId}`,Date.now()); await send(`🎁 Daily reward! +$1000 | Balance: $${getDB(`money_${userId}`,0)}`) }
    if(command==='inventory'||command==='inv'){ let house=getDB(`prop_${userId}_house`,0),mansion=getDB(`prop_${userId}_mansion`,0),hotel=getDB(`prop_${userId}_hotel`,0),pet=getDB(`pet_${userId}`,'none'),happy=getDB(`pet_happy_${userId}`,100); await send(`🎒 *Inventory*\n💵 Balance: $${balance}\n🐟 Fish: ${fishInv} ($${fishInv*50})\n🏠 Houses: ${house} | Mansions: ${mansion} | Hotels: ${hotel}\n🐾 Pet: ${pet} (${happy}%)\n📈 Stocks: !stocks portfolio\n🏆 LVL: ${level} EXP: ${exp}/1000`) }
  })
}
startBot()
