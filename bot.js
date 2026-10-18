const { default: makeWASocket, useMultiFileAuthState } = require('@whiskeysockets/baileys')
const P = require('pino')
const fs = require('fs')

// Simple JSON DB - No better-sqlite3 needed!
let db = {}
try { db = JSON.parse(fs.readFileSync('./database.json')) } catch { db = {} }
function saveDB(){ fs.writeFileSync('./database.json', JSON.stringify(db, null, 2)) }
function getDB(key, def){ return db[key] !== undefined ? db[key] : def }
function setDB(key, val){ db[key]=val; saveDB(); return val }
function addDB(key, val){ db[key]=(db[key]||0)+val; saveDB(); return db[key] }

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
    const { connection } = update
    if(connection === 'open') console.log('✅ WhatsApp Bot Connected! SCAN QR IN RAILWAY LOGS')
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

    if(command==='menu' || command==='help'){
      let prog=getDB(`challenge_${today}`,0); let personal=getDB(`challenge_${userId}_${today}`,0)
      let useProg=challenges[today].shared?prog:personal; let bar=makeBar(useProg,challenges[today].goal)
      await send(`💰 *ECONOMY RPG - FULL MENU*\n📅 TODAY: ${today.toUpperCase()} - ${challenges[today].name} ${bar} ${useProg}/${challenges[today].goal}\n\n🎰 !cf !slots !dice\n🌾 !farm !crops\n🐾 !pet\n🎣 !fish\n👹 !hunt\n🏠 !properties !buy\n📈 !stocks\n🏁 !race\n📱 !qr <link>\n\nBalance $${balance} | LVL ${level} (${getLevelBoost(level).toFixed(1)}x)`)
    }
    if(command==='challenge'){
      let prog=getDB(`challenge_${today}`,0); let personal=getDB(`challenge_${userId}_${today}`,0)
      let chal=challenges[today]; let useProg=chal.shared?prog:personal; let bar=makeBar(useProg,chal.goal)
      await send(`📅 *${today.toUpperCase()} CHALLENGE: ${chal.name.toUpperCase()}*\nGoal: ${chal.goal} ${chal.unit}\nProgress: ${useProg}/${chal.goal}\n${bar}\nReward: ${chal.reward}`)
    }
    if(command==='balance' || command==='bal'){ await send(`💵 Balance: $${balance}\nLVL: ${level} | EXP ${exp}/1000 Boost ${getLevelBoost(level)}x`) }
    if(command==='level'){ await send(`📈 LVL ${level} EXP ${exp}/1000 ${makeBar(exp,1000)} Boost ${getLevelBoost(level)}x`) }
    if(command==='qr'){
      let link=args.join(" "); if(!link) return send(`📱 Use: !qr <text or link>`)
      let qrUrl=`https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(link)}`
      await sock.sendMessage(from, { image: { url: qrUrl }, caption: `📱 QR for: ${link}`+footer() }, { quoted: msg })
    }
    if(command==='cf'){
      let choice=args[0]; let bet=parseInt(args[1])||100; if(balance<bet) return send(`No money! $${balance}`)
      let result=Math.random()>0.5?"heads":"tails"
      if(choice===result){ let win=Math.floor(bet*getLevelBoost(level)); addDB(`money_${userId}`,win); addDB(`challenge_${today}`,1); addDB(`challenge_${userId}_${today}`,1); await send(`🪙 ${result.toUpperCase()} WIN +$${win}`) }
      else{ addDB(`money_${userId}`,-bet); await send(`🪙 ${result.toUpperCase()} LOSE -$${bet}`) }
    }
    if(command==='slots'){
      let bet=parseInt(args[0])||100; if(balance<bet) return send(`No money!`)
      let s=["🍒","🍋","💎","7️⃣","🍀"]; let s1=s[Math.floor(Math.random()*s.length)], s2=s[Math.floor(Math.random()*s.length)], s3=s[Math.floor(Math.random()*s.length)]
      if(s1===s2&&s2===s3){ let win=Math.floor(bet*5*getLevelBoost(level)); addDB(`money_${userId}`,win); await send(`🎰 [ ${s1} | ${s2} | ${s3} ] JACKPOT +$${win}`) }
      else{ addDB(`money_${userId}`,-bet); await send(`🎰 [ ${s1} | ${s2} | ${s3} ] LOSE -$${bet}`) }
    }
    if(command==='dice'){
      let guess=parseInt(args[0]); let bet=parseInt(args[1])||100; let roll=Math.floor(Math.random()*6)+1
      if(guess===roll){ addDB(`money_${userId}`,bet*3); await send(`🎲 Rolled ${roll}! WIN +$${bet*3}`) } else { addDB(`money_${userId}`,-bet); await send(`🎲 Rolled ${roll}! LOSE -$${bet}`) }
    }
    if(command==='farm'){ let earn=Math.floor(250*getLevelBoost(level)); addDB(`money_${userId}`,earn); addDB(`challenge_${today}`,earn); await send(`🌾 Farmed +$${earn}`) }
    if(command==='pet'){
      let happy=getDB(`pet_happy_${userId}`,100)
      if(args[0]==='feed'){ setDB(`pet_happy_${userId}`,Math.min(100,happy+20)); return send(`🐶 Fed! ${Math.min(100,happy+20)}%`) }
      if(args[0]==='play'){ setDB(`pet_happy_${userId}`,Math.min(100,happy+15)); return send(`🐶 Played! ${Math.min(100,happy+15)}%`) }
      await send(`🐾 Pet: ${happy}% Happy !pet feed/play`)
    }
    if(command==='fish'){
      if(args[0]==='sell'){ let f=getDB(`fish_${userId}`,0); let sell=f*50; setDB(`fish_${userId}`,0); addDB(`money_${userId}`,sell); return send(`🎣 Sold ${f} fish $${sell}`) }
      addDB(`fish_${userId}`,1); addDB(`challenge_${today}`,1); await send(`🎣 Caught! Total: ${getDB(`fish_${userId}`,1)}`)
    }
    if(command==='hunt'){
      let m=["Goblin","Orc","Dragon","Slime"][Math.floor(Math.random()*4)]; let earn=Math.floor((100+Math.random()*200)*getLevelBoost(level))
      addDB(`money_${userId}`,earn); addDB(`exp_${userId}`,50); addDB(`challenge_${today}`,1)
      let newExp=getDB(`exp_${userId}`,0); if(newExp>=1000&&level<10){ addDB(`level_${userId}`,1); setDB(`exp_${userId}`,0); return send(`👹 Killed ${m}! +$${earn} LEVEL UP LVL${level+1}`) }
      await send(`👹 Killed ${m}! +$${earn}`)
    }
    if(command==='properties'){ await send(`🏠 House $10k Mansion $50k Hotel $100k Use !buy <type>`) }
    if(command==='buy'){ let cost={house:10000,mansion:50000,hotel:100000}[args[0]]; if(!cost) return send(`!buy house/mansion/hotel`); if(balance<cost) return send(`Need $${cost}`); addDB(`money_${userId}`,-cost); await send(`🏠 Bought ${args[0]}!`) }
    if(command==='stocks'){ await send(`📈 TSLA $200 AAPL $150 BTC $500 Use !stocks buy <sym> <amt>`) }
    if(command==='race'){ addDB(`challenge_${today}`,1); await send(`🏁 Race done! GC ${getDB(`challenge_${today}`,1)}/5 ${makeBar(getDB(`challenge_${today}`,1),5)}`) }
    if(command==='daily'){ let last=getDB(`daily_${userId}`,0); if(Date.now()-last<86400000) return send(`⏰ Already claimed`); addDB(`money_${userId}`,1000); setDB(`daily_${userId}`,Date.now()); await send(`🎁 Daily +$1000`) }
  })
}
startBot()
