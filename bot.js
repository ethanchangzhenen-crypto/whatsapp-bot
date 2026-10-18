const { default: makeWASocket, useMultiFileAuthState } = require('@whiskeysockets/baileys')
const P = require('pino')
const qrcode = require('qrcode-terminal')
const fs = require('fs')

// JSON DB - No better-sqlite3
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
      console.log('==================== QR CODE - SCAN WITH WHATSAPP ====================')
      qrcode.generate(qr, {small: true})
      console.log('=======================================================================')
      console.log('Link: https://wa.me/qr/'+qr.slice(0,10)+'... SCAN ABOVE BLOCK QR')
    }
    if(connection === 'open'){ console.log('✅ WhatsApp Bot Connected!') }
    if(connection === 'close'){ console.log('Reconnecting...'); setTimeout(startBot,2000) }
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

    // !MENU
    if(command==='menu'||command==='help'){
      let prog=getDB(`challenge_${today}`,0); let personal=getDB(`challenge_${userId}_${today}`,0)
      let useProg=challenges[today].shared?prog:personal; let bar=makeBar(useProg,challenges[today].goal)
      await sock.sendMessage(from, { text: `💰 *ECONOMY RPG - FULL MENU*
📅 TODAY: ${today.toUpperCase()} - ${challenges[today].name} ${bar} ${useProg}/${challenges[today].goal}

🎰 GAMBLING: !cf !slots !dice !gamble
🌾 FARMING: !farm !crops plant !sell
🐾 PET: !pet !pet feed !pet play !pet buy
🎣 FISHING: !fish !fish sell !fish inv
👹 HUNT: !hunt (LVL1-10 Boost) !level !leaderboard
🏠 PROPERTY: !properties !buy house/mansion/hotel
📈 STOCKS: !stocks !stocks buy !stocks portfolio
🏁 RACE: !race
📱 QR: !qr <text/link>
💵 OTHER: !balance !daily !inventory !challenge

Balance $${balance} | LVL ${level} (${getLevelBoost(level).toFixed(1)}x)
${footer()}` }, { quoted: msg })
    }

    if(command==='challenge'){
      let prog=getDB(`challenge_${today}`,0); let personal=getDB(`challenge_${userId}_${today}`,0)
      let chal=challenges[today]; let useProg=chal.shared?prog:personal; let bar=makeBar(useProg,chal.goal)
      await send(`📅 *${today.toUpperCase()} CHALLENGE: ${chal.name}*\nGoal: ${chal.goal} ${chal.unit}\nProgress: ${useProg}/${chal.goal}\n${bar}\nReward: ${chal.reward}\nGC TOTAL: ${prog}/150`)
    }
    if(command==='balance'||command==='bal'){ await send(`💵 Balance: $${balance}\n📊 LVL: ${level} | EXP: ${exp}/1000 | Boost: ${getLevelBoost(level)}x`) }
    if(command==='level'){ await send(`📈 LVL ${level} EXP ${exp}/1000 ${makeBar(exp,1000)} Boost ${getLevelBoost(level)}x\nLVL10 = 2.5x Money!`) }
    if(command==='qr'){
      let link=args.join(" "); if(!link) return send(`📱 Use: !qr <text or link>\nExample: !qr https://discord.gg/xyz`)
      let qrUrl=`https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(link)}`
      await sock.sendMessage(from, { image: { url: qrUrl }, caption: `📱 *QR CODE*\nLink: ${link}`+footer() }, { quoted: msg })
    }
    if(command==='cf'){
      let choice=args[0]; let bet=parseInt(args[1])||100; if(balance<bet) return send(`No money! Balance $${balance}`)
      let result=Math.random()>0.5?"heads":"tails"
      if(choice===result){ let win=Math.floor(bet*getLevelBoost(level)); addDB(`money_${userId}`,win); addDB(`challenge_${today}`,1); addDB(`challenge_${userId}_${today}`,1); await send(`🪙 CF: ${result.toUpperCase()}! WIN +$${win}`) }
      else{ addDB(`money_${userId}`,-bet); await send(`🪙 CF: ${result.toUpperCase()}! LOSE -$${bet}`) }
    }
    if(command==='slots'){
      let bet=parseInt(args[0])||100; if(balance<bet) return send(`No money!`)
      let slots=["🍒","🍋","💎","7️⃣","🍀"]; let s1=slots[Math.floor(Math.random()*slots.length)], s2=slots[Math.floor(Math.random()*slots.length)], s3=slots[Math.floor(Math.random()*slots.length)]
      if(s1===s2&&s2===s3){ let win=Math.floor(bet*5*getLevelBoost(level)); addDB(`money_${userId}`,win); addDB(`challenge_${today}`,1); await send(`🎰 [ ${s1} | ${s2} | ${s3} ] JACKPOT! +$${win}`) }
      else{ addDB(`money_${userId}`,-bet); await send(`🎰 [ ${s1} | ${s2} | ${s3} ] LOSE -$${bet}`) }
    }
    if(command==='dice'){
      let guess=parseInt(args[0]); let bet=parseInt(args[1])||100; if(isNaN(guess)) return send(`Use: !dice <1-6> <bet>`)
      let roll=Math.floor(Math.random()*6)+1
      if(guess===roll){ let win=bet*3; addDB(`money_${userId}`,win); await send(`🎲 Rolled ${roll}! WIN +$${win}`) }
      else{ addDB(`money_${userId}`,-bet); await send(`🎲 Rolled ${roll}! LOSE -$${bet}`) }
    }
    if(command==='farm'||command==='crops'){
      if(args[0]==='plant'){ setDB(`crop_${userId}`,{type:args[1]||'wheat',time:Date.now()}); return send(`🌱 Planted ${args[1]||'wheat'}!`) }
      let earned=Math.floor(250*getLevelBoost(level)); addDB(`money_${userId}`,earned); addDB(`challenge_${today}`,earned); addDB(`challenge_${userId}_${today}`,earned)
      await send(`🌾 Farmed +$${earned} | Boost: ${getLevelBoost(level)}x`)
    }
    if(command==='pet'){
      let happy=getDB(`pet_happy_${userId}`,100)
      if(args[0]==='feed'){ setDB(`pet_happy_${userId}`,Math.min(100,happy+20)); return send(`🐶 Fed! Happiness: ${Math.min(100,happy+20)}%`) }
      if(args[0]==='play'){ setDB(`pet_happy_${userId}`,Math.min(100,happy+15)); return send(`🐶 Played! ${Math.min(100,happy+15)}%`) }
      if(args[0]==='buy'){ setDB(`pet_${userId}`,args[1]||'dog'); return send(`🐾 Bought pet: ${args[1]||'dog'}!`) }
      await send(`🐾 Pet Status: ${happy}% Happy\n!pet feed / !pet play / !pet buy`)
    }
    if(command==='fish'){
      if(args[0]==='sell'){ let f=getDB(`fish_${userId}`,0); let sell=f*50; setDB(`fish_${userId}`,0); addDB(`money_${userId}`,sell); return send(`🎣 Sold ${f} fish for $${sell}`) }
      if(args[0]==='inv'){ return send(`🎣 Fish Inventory: ${fishInv} fish`) }
      addDB(`fish_${userId}`,1); addDB(`challenge_${today}`,1); addDB(`challenge_${userId}_${today}`,1)
      await send(`🎣 Caught 1 fish! Total: ${getDB(`fish_${userId}`,1)} ${today==='friday'?makeBar(getDB(`fish_${userId}`,1),200):''}`)
    }
    if(command==='hunt'){
      let monsters=["Goblin","Orc","Dragon","Slime"]; let m=monsters[Math.floor(Math.random()*monsters.length)]
      let earn=Math.floor((100+Math.random()*200)*getLevelBoost(level)); addDB(`money_${userId}`,earn); addDB(`exp_${userId}`,50); addDB(`challenge_${today}`,1); addDB(`challenge_${userId}_${today}`,1)
      let newExp=getDB(`exp_${userId}`,0); if(newExp>=1000&&level<10){ addDB(`level_${userId}`,1); setDB(`exp_${userId}`,0); return send(`👹 Killed ${m}! +$${earn} +50 EXP\n🎉 LEVEL UP! Now LVL${level+1} Boost: ${getLevelBoost(level+1)}x`) }
      await send(`👹 Killed ${m}! +$${earn} +50 EXP`)
    }
    if(command==='properties'||command==='buy'){
      let props={house:10000,mansion:50000,hotel:100000}
      if(command==='buy'){ let type=args[0]; if(!props[type]) return send(`Houses: house $10k mansion $50k hotel $100k`); if(balance<props[type]) return send(`Need $${props[type]} Have $${balance}`); addDB(`money_${userId}`,-props[type]); addDB(`prop_${userId}_${type}`,1); return send(`🏠 Bought ${type} for $${props[type]}!`) }
      await send(`🏠 *Properties*\nHouse - $10k - $500/day\nMansion - $50k - $3000/day\nHotel - $100k - $7000/day\n!buy <type> | !properties collect`)
    }
    if(command==='stocks'){
      let stocks={TSLA:200,AAPL:150,BTC:500}
      if(args[0]==='buy'){ let sym=args[1]?.toUpperCase(); let amt=parseInt(args[2])||1; if(!stocks[sym]) return send(`Stocks: TSLA AAPL BTC`); let cost=stocks[sym]*amt; if(balance<cost) return send(`Need $${cost}`); addDB(`money_${userId}`,-cost); addDB(`stock_${userId}_${sym}`,amt); return send(`📈 Bought ${amt}x ${sym} for $${cost}`) }
      if(args[0]==='portfolio'){ let t=getDB(`stock_${userId}_TSLA`,0),a=getDB(`stock_${userId}_AAPL`,0),b=getDB(`stock_${userId}_BTC`,0); return send(`📈 Portfolio: TSLA:${t} AAPL:${a} BTC:${b}`) }
      await send(`📈 *Stocks Market*\nTSLA: $200\nAAPL: $150\nBTC: $500\n!stocks buy <symbol> <amount>`)
    }
    if(command==='race'){ addDB(`challenge_${today}`,1); addDB(`challenge_${userId}_${today}`,1); let gcProg=getDB(`challenge_${today}`,0); await send(`🏁 Race finished! GC Races: ${gcProg}/5 ${makeBar(gcProg,5)}`) }
    if(command==='daily'){ let last=getDB(`daily_${userId}`,0); if(Date.now()-last<86400000) return send(`⏰ Daily already claimed!`); addDB(`money_${userId}`,1000); setDB(`daily_${userId}`,Date.now()); await send(`🎁 Daily reward! +$1000`) }
    if(command==='inventory'||command==='inv'){ let house=getDB(`prop_${userId}_house`,0),mansion=getDB(`prop_${userId}_mansion`,0),pet=getDB(`pet_${userId}`,'none'); await send(`🎒 *Inventory*\nFish: ${fishInv}\nHouses: ${house} Mansion: ${mansion}\nPet: ${pet}\nBalance: $${balance}`) }
  })
}
startBot()
