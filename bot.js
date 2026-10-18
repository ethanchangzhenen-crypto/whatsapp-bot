const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys')
const P = require('pino')
const { QuickDB } = require('quick.db')
const db = new QuickDB()
const qrcode = require('qrcode-terminal')

// ===== CHALLENGE SYSTEM =====
const challenges = {
  monday: { name: "Gambling", goal: 20, unit: "gambles", reward: "$2000" },
  tuesday: { name: "Farm Easy", goal: 10000, unit: "$ farmed", reward: "2x Farm" },
  wednesday: { name: "Farm Hard", goal: 25000, unit: "$ farmed", reward: "$5000" },
  thursday: { name: "Pet Care", goal: 100, unit: "% happiness", reward: "Pet EXP" },
  friday: { name: "Fishing Frenzy", goal: 200, unit: "fish", reward: "$3000" },
  saturday: { name: "GC Hunt", goal: 150, unit: "monsters", reward: "500 EXP EACH", shared: true },
  sunday: { name: "GC Race Day", goal: 5, unit: "races", reward: "RESET TONIGHT", shared: true }
}

function getToday(){ const d=['sunday','monday','tuesday','wednesday','thursday','friday','saturday']; return d[new Date().getDay()]; }
function makeBar(c,g){ let p=Math.min(Math.floor((c/g)*100),100); let f=Math.floor(p/10); return `[${"█".repeat(f)}${"░".repeat(10-f)}] ${p}%`; }
function footer(){ let day=getToday(); let Day=day.charAt(0).toUpperCase()+day.slice(1); return `\n\nRemember to do your ${Day} challenge! Use !challenge to see it!`; }
function getLevelBoost(l){ return 1+(l*0.15); }

async function startBot(){
  const { state, saveCreds } = await useMultiFileAuthState('./auth')
  const sock = makeWASocket({ auth: state, logger: P({level: 'silent'}), printQRInTerminal: true })
  sock.ev.on('creds.update', saveCreds)

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect } = update
    if(connection === 'close'){
      console.log('Reconnecting...')
      startBot()
    } else if(connection === 'open'){
      console.log('✅ WhatsApp Bot Connected!')
    }
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
    
    let balance = await db.get(`money_${userId}`) || 1000
    let level = await db.get(`level_${userId}`) || 1
    let exp = await db.get(`exp_${userId}`) || 0
    let fishInv = await db.get(`fish_${userId}`) || 0
    let today = getToday()

    const send = async (txt) => {
      await sock.sendMessage(from, { text: txt + footer() }, { quoted: msg })
    }

    // !MENU - FULL
    if(command==='menu' || command==='help'){
      let prog = await db.get(`challenge_${today}`) || 0
      let personal = await db.get(`challenge_${userId}_${today}`) || 0
      let useProg = challenges[today].shared ? prog : personal
      let bar = makeBar(useProg, challenges[today].goal)
      await sock.sendMessage(from, { text: `💰 *ECONOMY RPG - FULL MENU*
📅 TODAY: ${today.toUpperCase()} - ${challenges[today].name}
${bar} ${useProg}/${challenges[today].goal} ${challenges[today].unit}

🎰 *GAMBLING:*
!cf <heads/tails> <bet>
!slots <bet>
!dice <1-6> <bet>

🌾 *FARMING:*
!farm - Farm crops ($250)
!crops - Check crops
!crops plant <type>
!sell crops

🐾 *PET SYSTEM:*
!pet - View pet
!pet feed - +20% happy
!pet play - +15% happy
!pet buy <name>

🎣 *FISHING:*
!fish - Fish
!fish sell - Sell all fish
!fish inv - Inventory

👹 *HUNTING:*
!hunt - Hunt monsters (EXP + Money)
!level - Check LVL1-10 & Boost
!leaderboard - Top hunters

🏠 *PROPERTIES:*
!properties - View all
!buy <house/mansion/hotel>
!properties collect - Collect rent

📈 *STOCKS:*
!stocks - View market
!stocks buy <symbol> <amount>
!stocks sell <symbol> <amount>
!stocks portfolio

🏁 *RACE (SUNDAY):*
!race - Start race
!race join - Join GC race

📱 *QR CODE:*
!qr <text/link> - Generate QR

💵 *OTHER:*
!balance - Check money
!daily - Daily reward
!inventory
!challenge - Daily challenge

Your Balance: $${balance} | LVL: ${level} (${getLevelBoost(level).toFixed(1)}x boost)
${footer()}` }, { quoted: msg })
    }

    // !CHALLENGE REAL TIME
    if(command==='challenge'){
      let prog = await db.get(`challenge_${today}`) || 0
      let personal = await db.get(`challenge_${userId}_${today}`) || 0
      let chal = challenges[today]
      let useProg = chal.shared ? prog : personal
      let bar = makeBar(useProg, chal.goal)
      let need = chal.goal - useProg
      await send(`📅 *${today.toUpperCase()} CHALLENGE: ${chal.name.toUpperCase()}*
━━━━━━━━━━━━━━━
Goal: ${chal.goal} ${chal.unit}
Progress: ${useProg}/${chal.goal}
${bar}

${need>0?`Need ${need} more!`:`✅ COMPLETED!`}
Reward: ${chal.reward}
LVL1-8: ${bar}
GC TOTAL: ${prog}/150`)
    }

    // !BALANCE
    if(command==='balance' || command==='bal'){
      await send(`💵 *Balance:* $${balance}\n📊 *LVL:* ${level} | Boost: ${getLevelBoost(level)}x more money\n⭐ EXP: ${exp}/1000`)
    }

    // !LEVEL
    if(command==='level'){
      let bar = makeBar(exp,1000)
      await send(`📈 *Level System LVL1-10*\nLevel: ${level}\nEXP: ${exp}/1000 ${bar}\nBoost: ${getLevelBoost(level)}x (+${Math.floor((getLevelBoost(level)-1)*100)}%)\nLVL10 = 2.5x Money!`)
    }

    // !QR - REAL SCANNABLE
    if(command==='qr'){
      let link = args.join(" ")
      if(!link) return send(`📱 Use: !qr <text or link>\nExample: !qr https://discord.gg/xyz`)
      let qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(link)}`
      await sock.sendMessage(from, { image: { url: qrUrl }, caption: `📱 *QR CODE*\nLink: ${link}\nScan to open!` + footer() }, { quoted: msg })
    }

    // !CF
    if(command==='cf'){
      let choice=args[0]; let bet=parseInt(args[1])||100
      if(balance<bet) return send(`No money! Balance $${balance}`)
      let result=Math.random()>0.5?"heads":"tails"
      if(choice===result){ let win=Math.floor(bet*getLevelBoost(level)); await db.add(`money_${userId}`,win); await db.add(`challenge_${today}`,1); await db.add(`challenge_${userId}_${today}`,1); await send(`🪙 CF: ${result.toUpperCase()}! WIN +$${win}`) }
      else{ await db.add(`money_${userId}`,-bet); await send(`🪙 CF: ${result.toUpperCase()}! LOSE -$${bet}`) }
    }

    // !SLOTS
    if(command==='slots'){
      let bet=parseInt(args[0])||100
      if(balance<bet) return send(`No money!`)
      let slots=["🍒","🍋","💎","7️⃣","🍀"]
      let s1=slots[Math.floor(Math.random()*slots.length)]
      let s2=slots[Math.floor(Math.random()*slots.length)]
      let s3=slots[Math.floor(Math.random()*slots.length)]
      if(s1===s2&&s2===s3){ let win=bet*5*getLevelBoost(level); await db.add(`money_${userId}`,Math.floor(win)); await db.add(`challenge_${today}`,1); await send(`🎰 [ ${s1} | ${s2} | ${s3} ] JACKPOT! +$${Math.floor(win)}`) }
      else{ await db.add(`money_${userId}`,-bet); await send(`🎰 [ ${s1} | ${s2} | ${s3} ] LOSE -$${bet}`) }
    }

    // !DICE
    if(command==='dice'){
      let guess=parseInt(args[0]); let bet=parseInt(args[1])||100
      if(isNaN(guess)) return send(`Use: !dice <1-6> <bet>`)
      let roll=Math.floor(Math.random()*6)+1
      if(guess===roll){ let win=bet*3; await db.add(`money_${userId}`,win); await send(`🎲 Rolled ${roll}! You guessed ${guess} WIN +$${win}`) }
      else{ await db.add(`money_${userId}`,-bet); await send(`🎲 Rolled ${roll}! You guessed ${guess} LOSE -$${bet}`) }
    }

    // !FARM / CROPS
    if(command==='farm' || command==='crops'){
      if(args[0]==='plant'){ let type=args[1]||'wheat'; await db.set(`crop_${userId}`,{type,time:Date.now()}); return send(`🌱 Planted ${type}! Wait 5 mins`) }
      let earned=Math.floor(250*getLevelBoost(level))
      await db.add(`money_${userId}`,earned); await db.add(`challenge_${today}`,earned); await db.add(`challenge_${userId}_${today}`,earned)
      await send(`🌾 Farmed +$${earned} | Boost: ${getLevelBoost(level)}x`)
    }

    // !PET
    if(command==='pet'){
      let happy=await db.get(`pet_happy_${userId}`)||100
      if(args[0]==='feed'){ await db.set(`pet_happy_${userId}`,Math.min(100,happy+20)); return send(`🐶 Fed pet! Happiness: ${Math.min(100,happy+20)}%`) }
      if(args[0]==='play'){ await db.set(`pet_happy_${userId}`,Math.min(100,happy+15)); return send(`🐶 Played! Happiness: ${Math.min(100,happy+15)}%`) }
      if(args[0]==='buy'){ let name=args[1]||'dog'; await db.set(`pet_${userId}`,name); return send(`🐾 Bought pet: ${name}!`) }
      await send(`🐾 Pet Status: ${happy}% Happy\n!pet feed / !pet play / !pet buy`)
    }

    // !FISH
    if(command==='fish'){
      if(args[0]==='sell'){ let f=await db.get(`fish_${userId}`)||0; let sell=f*50; await db.set(`fish_${userId}`,0); await db.add(`money_${userId}`,sell); return send(`🎣 Sold ${f} fish for $${sell}`) }
      if(args[0]==='inv'){ return send(`🎣 Fish Inventory: ${fishInv} fish`) }
      await db.add(`fish_${userId}`,1); await db.add(`challenge_${today}`,1); await db.add(`challenge_${userId}_${today}`,1)
      let newFish=await db.get(`fish_${userId}`)
      await send(`🎣 Caught 1 fish! Total: ${newFish} ${today==='friday'?makeBar(newFish,200):''}`)
    }

    // !HUNT
    if(command==='hunt'){
      let monsters=["Goblin","Orc","Dragon","Slime"]
      let m=monsters[Math.floor(Math.random()*monsters.length)]
      let earn=Math.floor((100+Math.random()*200)*getLevelBoost(level))
      let expGain=50
      await db.add(`money_${userId}`,earn); await db.add(`exp_${userId}`,expGain); await db.add(`challenge_${today}`,1); await db.add(`challenge_${userId}_${today}`,1)
      let newExp=await db.get(`exp_${userId}`)
      if(newExp>=1000 && level<10){ await db.add(`level_${userId}`,1); await db.set(`exp_${userId}`,0); return send(`👹 Killed ${m}! +$${earn} +${expGain} EXP\n🎉 LEVEL UP! Now LVL${level+1} Boost: ${getLevelBoost(level+1)}x`) }
      await send(`👹 Killed ${m}! +$${earn} +${expGain} EXP`)
    }

    // !PROPERTIES
    if(command==='properties' || command==='buy'){
      let props={house:10000,mansion:50000,hotel:100000}
      if(command==='buy'){ let type=args[0]; if(!props[type]) return send(`Houses: house $10k mansion $50k hotel $100k`); if(balance<props[type]) return send(`Need $${props[type]} Have $${balance}`); await db.add(`money_${userId}`,-props[type]); await db.add(`prop_${userId}_${type}`,1); return send(`🏠 Bought ${type} for $${props[type]}!`) }
      await send(`🏠 *Properties Shop*\nHouse - $10,000 - $500/day rent\nMansion - $50,000 - $3000/day\nHotel - $100,000 - $7000/day\nUse !buy <type> | !properties collect`)
    }

    // !STOCKS
    if(command==='stocks'){
      let stocks={TSLA:200,AAPL:150,BTC:500}
      if(args[0]==='buy'){ let sym=args[1]?.toUpperCase(); let amt=parseInt(args[2])||1; if(!stocks[sym]) return send(`Stocks: TSLA AAPL BTC`); let cost=stocks[sym]*amt; if(balance<cost) return send(`Need $${cost}`); await db.add(`money_${userId}`,-cost); await db.add(`stock_${userId}_${sym}`,amt); return send(`📈 Bought ${amt}x ${sym} for $${cost}`) }
      if(args[0]==='portfolio'){ let t=await db.get(`stock_${userId}_TSLA`)||0; let a=await db.get(`stock_${userId}_AAPL`)||0; let b=await db.get(`stock_${userId}_BTC`)||0; return send(`📈 Portfolio: TSLA:${t} AAPL:${a} BTC:${b}`) }
      await send(`📈 *Stocks Market*\nTSLA: $200\nAAPL: $150\nBTC: $500\nUse !stocks buy <symbol> <amount>`)
    }

    // !RACE
    if(command==='race'){
      await db.add(`challenge_${today}`,1); await db.add(`challenge_${userId}_${today}`,1)
      let gcProg=await db.get(`challenge_${today}`)||1
      await send(`🏁 Race finished! GC Races: ${gcProg}/5 ${makeBar(gcProg,5)}`)
    }

    // !DAILY
    if(command==='daily'){
      let last=await db.get(`daily_${userId}`) || 0
      if(Date.now()-last<86400000) return send(`⏰ Daily already claimed! Wait ${Math.floor((86400000-(Date.now()-last))/3600000)}h`)
      await db.add(`money_${userId}`,1000); await db.set(`daily_${userId}`,Date.now())
      await send(`🎁 Daily reward! +$1000`)
    }

    // !INVENTORY
    if(command==='inventory' || command==='inv'){
      let house=await db.get(`prop_${userId}_house`)||0
      let mansion=await db.get(`prop_${userId}_mansion`)||0
      let pet=await db.get(`pet_${userId}`)||'none'
      await send(`🎒 *Inventory*\nFish: ${fishInv}\nHouses: ${house} Mansion: ${mansion}\nPet: ${pet}\nBalance: $${balance}`)
    }
  })
}

startBot()
