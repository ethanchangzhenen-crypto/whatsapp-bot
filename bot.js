const { default: makeWASocket, useMultiFileAuthState } = require('@whiskeysockets/baileys')
const P = require('pino')
const fs = require('fs')
const express = require('express')
const QRCode = require('qrcode')

const app = express()
let qrCode = null
let connected = false
app.get('/', async (req,res)=>{
  if(connected) return res.send('<h1>✅ BOT CONNECTED - FULL FEATURES ACTIVE!</h1><style>body{font-family:Arial;text-align:center;padding:50px}</style>')
  if(qrCode){ let img=await QRCode.toDataURL(qrCode); return res.send(`<center><h1>SCAN</h1><img src="${img}" style="width:350px"><script>setTimeout(()=>location.reload(),20000)</script></center>`) }
  res.send('Starting...<script>setTimeout(()=>location.reload(),2000)</script>')
})
app.listen(process.env.PORT||3000)

let db={}; try{db=JSON.parse(fs.readFileSync('./database.json'))}catch{db={}}
function save(){fs.writeFileSync('./database.json',JSON.stringify(db,null,2))}
function get(k,d){return db[k]!==undefined?db[k]:d}
function set(k,v){db[k]=v;save()}
function add(k,v){db[k]=(db[k]||0)+v;save();return db[k]}
function makeBar(c,g){let p=Math.min(Math.floor(c/g*100),100);let f=Math.floor(p/10);return `[${"█".repeat(f)}${"░".repeat(10-f)}] ${p}%`;}
function getBoost(l){return 1+(l*0.15);}

const challenges = {
  monday:{name:"Gambling",goal:20,unit:"gambles"}, tuesday:{name:"Farm Easy",goal:10000,unit:"$"},
  wednesday:{name:"Farm Hard",goal:25000,unit:"$"}, thursday:{name:"Pet Care",goal:100,unit:"%"},
  friday:{name:"Fishing",goal:200,unit:"fish"}, saturday:{name:"GC Hunt",goal:150,unit:"monsters",shared:true},
  sunday:{name:"GC Race",goal:5,unit:"races",shared:true}
}
function getToday(){return ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'][new Date().getDay()]}

async function start(){
  const { state, saveCreds } = await useMultiFileAuthState('./auth')
  const sock = makeWASocket({ auth: state, logger: P({level:'silent'}) })
  sock.ev.on('creds.update', saveCreds)
  sock.ev.on('connection.update', ({connection, qr})=>{
    if(qr){ qrCode=qr; console.log('QR READY') }
    if(connection==='open'){ connected=true; qrCode=null; console.log('✅ CONNECTED') }
    if(connection==='close'){ connected=false; setTimeout(start,2000) }
  })

    sock.ev.on('messages.upsert', async ({messages})=>{
    try{
      const msg = messages[0]
      if(!msg || !msg.message) return
      if(msg.key.remoteJid === 'status@broadcast') return
      // Don't block owner - allow all except bot's own replies
      // if(msg.key.fromMe) return  <-- REMOVED THIS LINE THAT BLOCKED YOU

      let text = msg.message.conversation || msg.message.extendedTextMessage?.text || msg.message.imageMessage?.caption || ""
      if(!text.startsWith('!')) return
      console.log('CMD:', text, 'FROM:', msg.key.remoteJid)
      const from = msg.key.remoteJid
      const args = text.slice(1).trim().split(/ +/)
      const cmd = args.shift().toLowerCase()
      const uid = msg.key.participant || msg.key.remoteJid || from
      let bal = get(`money_${uid}`,1000)
      let lvl = get(`level_${uid}`,1)
      let exp = get(`exp_${uid}`,0)
      let today = getToday()

      const send = async (t) => { 
        await sock.sendMessage(from, {text:t}, {quoted: msg}) 
      }

      if(cmd==='menu'||cmd==='help'){
        await send(`💰 *ECONOMY RPG - ALL COMMANDS*
📅 Today ${today}

🎰 !cf heads 100 / !slots 100 / !dice 3 100
🌾 !farm / !crops plant wheat
🐾 !pet / !pet feed / !pet play / !pet buy dog
🎣 !fish / !fish sell / !fish inv
👹 !hunt / !level
🏠 !properties / !buy house / !properties collect
📈 !stocks / !stocks buy TSLA 1 / !stocks portfolio
🏁 !race
📱 !qr <text>
💵 !balance !daily !inventory !challenge

Bal $${bal} LVL${lvl}`)
      }
      else if(cmd==='balance'||cmd==='bal'){ await send(`💵 Your Balance: $${bal}\nLVL${lvl} EXP ${exp}/1000 ${makeBar(exp,1000)}`) }
      else if(cmd==='slots'){
        let bet=parseInt(args[0])||100; 
        if(bal<bet) return send(`❌ Need $${bet} | You have $${bal}`)
        let s=['🍒','🍋','💎','7️⃣','🍀']; 
        let a=s[Math.floor(Math.random()*5)],b=s[Math.floor(Math.random()*5)],c=s[Math.floor(Math.random()*5)]
        if(a===b&&b===c){ 
          let win=bet*5; 
          let newBal=add(`money_${uid}`,win); 
          await send(`🎰 [ ${a} | ${b} | ${c} ] JACKPOT!\n+ $${win}\n💰 New Balance: $${newBal}`) 
        } else { 
          let newBal=add(`money_${uid}`,-bet); 
          await send(`🎰 [ ${a} | ${b} | ${c} ] LOSE -$${bet}\n💰 New Balance: $${newBal}`) 
        }
      }
      else if(cmd==='cf'){
        let choice=args[0]; let bet=parseInt(args[1])||100; 
        if(bal<bet) return send(`❌ Need $${bet} | Have $${bal}`)
        let res=Math.random()>0.5?'heads':'tails'
        if(choice===res){ let win=Math.floor(bet*getBoost(lvl)); let newBal=add(`money_${uid}`,win); await send(`🪙 ${res.toUpperCase()} WIN +$${win}\n💰 New Balance: $${newBal}`) }
        else{ let newBal=add(`money_${uid}`,-bet); await send(`🪙 ${res.toUpperCase()} LOSE -$${bet}\n💰 New Balance: $${newBal}`) }
      }
      else if(cmd==='dice'){
        let guess=parseInt(args[0]); let bet=parseInt(args[1])||100; let roll=Math.floor(Math.random()*6)+1
        if(guess===roll){ let newBal=add(`money_${uid}`,bet*3); await send(`🎲 Rolled ${roll} WIN +$${bet*3}\n💰 New Balance: $${newBal}`) } 
        else { let newBal=add(`money_${uid}`,-bet); await send(`🎲 Rolled ${roll} You guessed ${guess} LOSE -$${bet}\n💰 New Balance: $${newBal}`) }
      }
      else if(cmd==='farm'){ let e=Math.floor(250*getBoost(lvl)); let newBal=add(`money_${uid}`,e); await send(`🌾 Farmed +$${e}\n💰 New Balance: $${newBal}`) }
      else if(cmd==='fish'){ if(args[0]==='sell'){ let f=get(`fish_${uid}`,0); let v=f*50; set(`fish_${uid}`,0); let newBal=add(`money_${uid}`,v); await send(`🎣 Sold ${f} fish +$${v}\n💰 New Balance: $${newBal}`) } else if(args[0]==='inv'){ await send(`🎣 Fish: ${get(`fish_${uid}`,0)}`) } else { add(`fish_${uid}`,1); await send(`🎣 Caught! Total ${get(`fish_${uid}`,0)} | Bal $${bal}`) } }
      else if(cmd==='hunt'){ let earn=Math.floor((100+Math.random()*200)*getBoost(lvl)); let newBal=add(`money_${uid}`,earn); add(`exp_${uid}`,50); await send(`👹 Killed monster! +$${earn}\n💰 New Balance: $${newBal} | EXP ${get(`exp_${uid}`,0)}/1000`) }
      else if(cmd==='daily'){ add(`money_${uid}`,1000); await send(`🎁 Daily +$1000\n💰 New Balance: $${get(`money_${uid}`,0)}`) }
      else if(cmd==='challenge'){ let prog=get(`challenge_${today}`,0); await send(`📅 ${today} ${prog} ${makeBar(prog,100)}`) }
      else if(cmd==='qr'){ let link=args.join(' '); let url=`https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(link)}`; await sock.sendMessage(from, {image:{url:url}, caption:`📱 QR: ${link}`}, {quoted:msg}) }
      else if(cmd==='properties'){ await send(`🏠 House $10k / Mansion $50k / Hotel $100k\n!buy house`) }
      else if(cmd==='buy'){ let costs={house:10000,mansion:50000,hotel:100000}; let type=args[0]; if(!costs[type]) return send(`!buy house/mansion/hotel`); if(bal<costs[type]) return send(`Need $${costs[type]} Have $${bal}`); add(`money_${uid}`,-costs[type]); add(`prop_${uid}_${type}`,1); await send(`🏠 Bought ${type}!\n💰 New Balance: $${get(`money_${uid}`,0)}`) }
      else if(cmd==='stocks'){ await send(`📈 TSLA $200 !stocks buy TSLA 1`) }
      else if(cmd==='race'){ await send(`🏁 Race done!`) }
      else if(cmd==='pet'){ await send(`🐾 Pet !pet feed/play/buy`) }
      else if(cmd==='inventory'||cmd==='inv'){ await send(`🎒 Bal $${bal} Fish ${get(`fish_${uid}`,0)}`) }
      let text = msg.message.conversation || msg.message.extendedTextMessage?.text || msg.message.imageMessage?.caption || ""
      if(!text.startsWith('!')) return
      console.log('CMD:', text)
      const from = msg.key.remoteJid
      const args = text.slice(1).trim().split(/ +/)
      const cmd = args.shift().toLowerCase()
      const uid = msg.key.participant || from
      let bal = get(`money_${uid}`,1000)
      let lvl = get(`level_${uid}`,1)
      let exp = get(`exp_${uid}`,0)
      let today = getToday()

      const send = async (t) => { await sock.sendMessage(from, {text:t}) }

      if(cmd==='menu'||cmd==='help'){
        await send(`💰 *ECONOMY RPG - ALL COMMANDS*
📅 Today ${today} - ${challenges[today].name}

🎰 GAMBLE: !cf heads 100 / !slots 100 / !dice 3 100
🌾 FARM: !farm / !crops plant wheat / !crops sell
🐾 PET: !pet / !pet feed / !pet play / !pet buy dog
🎣 FISH: !fish / !fish sell / !fish inv
👹 HUNT LVL1-10: !hunt / !level
🏠 PROP: !properties / !buy house ($10k) mansion ($50k) hotel ($100k) / !properties collect
📈 STOCKS: !stocks / !stocks buy TSLA 1 / !stocks portfolio / !stocks sell TSLA 1
🏁 RACE: !race (Sunday GC)
📱 QR: !qr <text> - makes scannable QR
💵 !balance !daily !inventory !challenge !leaderboard

Bal $${bal} LVL${lvl} ${getBoost(lvl).toFixed(1)}x`)
      }
      else if(cmd==='balance'||cmd==='bal'){ await send(`💵 $${bal} LVL${lvl} EXP ${exp}/1000 ${makeBar(exp,1000)} Boost ${getBoost(lvl).toFixed(1)}x`) }
      else if(cmd==='level'){ await send(`📈 LVL ${lvl} EXP ${exp}/1000 ${makeBar(exp,1000)}\nBoost ${getBoost(lvl)}x\nLVL10 = 2.5x`) }
      else if(cmd==='challenge'){
        let prog=get(`challenge_${today}`,0); let personal=get(`challenge_${uid}_${today}`,0); let use=challenges[today].shared?prog:personal
        await send(`📅 ${today.toUpperCase()} ${challenges[today].name}\n${use}/${challenges[today].goal} ${makeBar(use,challenges[today].goal)}\nGC Total ${prog}`)
      }
      else if(cmd==='qr'){
        let link=args.join(' '); if(!link) return send('Use: !qr hello')
        let url=`https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(link)}`
        await sock.sendMessage(from, {image:{url:url}, caption:`📱 QR: ${link}`})
      }
      else if(cmd==='cf'){
        let choice=args[0]; let bet=parseInt(args[1])||100; if(bal<bet) return send(`Need $${bet} have $${bal}`)
        let res=Math.random()>0.5?'heads':'tails'
        if(choice===res){ let win=Math.floor(bet*getBoost(lvl)); add(`money_${uid}`,win); add(`challenge_${today}`,1); await send(`🪙 ${res.toUpperCase()} WIN +$${win}`) }
        else{ add(`money_${uid}`,-bet); await send(`🪙 ${res.toUpperCase()} LOSE -$${bet}`) }
      }
      else if(cmd==='slots'){
        let bet=parseInt(args[0])||100; if(bal<bet) return send(`Need $${bet}`)
        let s=['🍒','🍋','💎','7️⃣']; let a=s[Math.floor(Math.random()*4)],b=s[Math.floor(Math.random()*4)],c=s[Math.floor(Math.random()*4)]
        if(a===b&&b===c){ let win=bet*5; add(`money_${uid}`,win); await send(`🎰 [${a}|${b}|${c}] JACKPOT +$${win}`) }
        else{ add(`money_${uid}`,-bet); await send(`🎰 [${a}|${b}|${c}] LOSE -$${bet}`) }
      }
      else if(cmd==='dice'){
        let guess=parseInt(args[0]); let bet=parseInt(args[1])||100; let roll=Math.floor(Math.random()*6)+1
        if(guess===roll){ add(`money_${uid}`,bet*3); await send(`🎲 Rolled ${roll} WIN +$${bet*3}`) } else { add(`money_${uid}`,-bet); await send(`🎲 Rolled ${roll} LOSE -$${bet}`) }
      }
      else if(cmd==='farm'){ let e=Math.floor(250*getBoost(lvl)); add(`money_${uid}`,e); add(`challenge_${today}`,e); await send(`🌾 Farmed +$${e} Bal $${get(`money_${uid}`,0)}`) }
      else if(cmd==='crops'){ if(args[0]==='plant'){ set(`crop_${uid}`,Date.now()); await send(`🌱 Planted wheat! !crops sell to harvest`) } else if(args[0]==='sell'){ let v=Math.floor(500*getBoost(lvl)); add(`money_${uid}`,v); await send(`🌾 Sold +$${v}`) } else await send(`🌱 !crops plant wheat / !crops sell`) }
      else if(cmd==='pet'){ if(args[0]==='feed'||args[0]==='play'){ add(`challenge_${today}`,20); await send(`🐶 ${args[0]} done! 100% happy`) } else if(args[0]==='buy'){ set(`pet_${uid}`,args[1]||'dog'); await send(`🐾 Bought ${args[1]||'dog'}!`) } else await send(`🐾 Pet ${get(`pet_${uid}`,'none')} - !pet feed/play/buy dog`) }
      else if(cmd==='fish'){ if(args[0]==='sell'){ let f=get(`fish_${uid}`,0); let v=f*50; set(`fish_${uid}`,0); add(`money_${uid}`,v); await send(`🎣 Sold ${f} fish $${v}`) } else if(args[0]==='inv'){ await send(`🎣 Fish: ${get(`fish_${uid}`,0)} Value $${get(`fish_${uid}`,0)*50}`) } else { add(`fish_${uid}`,1); add(`challenge_${today}`,1); await send(`🎣 Caught! Total ${get(`fish_${uid}`,0)}`) } }
      else if(cmd==='hunt'){ let earn=Math.floor((100+Math.random()*200)*getBoost(lvl)); add(`money_${uid}`,earn); add(`exp_${uid}`,50); add(`challenge_${today}`,1); let ne=get(`exp_${uid}`,0); if(ne>=1000&&lvl<10){ add(`level_${uid}`,1); set(`exp_${uid}`,0); await send(`👹 Killed! +$${earn} LEVEL UP LVL${lvl+1}! Boost ${getBoost(lvl+1)}x`) } else await send(`👹 Killed! +$${earn} EXP ${ne}/1000 ${makeBar(ne,1000)}`) }
      else if(cmd==='properties'){ await send(`🏠 Shop:\nHouse $10k rent $500\nMansion $50k rent $3000\nHotel $100k rent $7000\n!buy house/mansion/hotel\n!properties collect - collect rent`) }
      else if(cmd==='buy'){ let costs={house:10000,mansion:50000,hotel:100000}; let type=args[0]; if(!costs[type]) return send(`!buy house/mansion/hotel`); if(bal<costs[type]) return send(`Need $${costs[type]}`); add(`money_${uid}`,-costs[type]); add(`prop_${uid}_${type}`,1); await send(`🏠 Bought ${type} for $${costs[type]}!`) }
      else if(cmd==='stocks'){ if(args[0]==='buy'){ let prices={TSLA:200,AAPL:150,BTC:500}; let sym=args[1]?.toUpperCase(); let amt=parseInt(args[2])||1; let price=prices[sym]||200; let cost=price*amt; if(bal<cost) return send(`Need $${cost}`); add(`money_${uid}`,-cost); add(`stock_${uid}_${sym}`,amt); await send(`📈 Bought ${amt}x ${sym} $${cost}`) } else if(args[0]==='portfolio'||args[0]==='p'){ await send(`📈 Portfolio TSLA:${get(`stock_${uid}_TSLA`,0)} AAPL:${get(`stock_${uid}_AAPL`,0)} BTC:${get(`stock_${uid}_BTC`,0)}`) } else await send(`📈 Stocks TSLA $200 AAPL $150 BTC $500\n!stocks buy TSLA 1\n!stocks portfolio`) }
      else if(cmd==='race'){ add(`challenge_${today}`,1); await send(`🏁 Race done! GC ${get(`challenge_${today}`,0)}/5 ${makeBar(get(`challenge_${today}`,0),5)}`) }
      else if(cmd==='daily'){ let last=get(`daily_${uid}`,0); if(Date.now()-last<86400000) return send(`⏰ Already claimed`); add(`money_${uid}`,1000); set(`daily_${uid}`,Date.now()); await send(`🎁 Daily +$1000 Bal $${get(`money_${uid}`,0)}`) }
      else if(cmd==='inventory'||cmd==='inv'){ await send(`🎒 Bal $${bal} Fish ${get(`fish_${uid}`,0)} Pet ${get(`pet_${uid}`,'none')} LVL${lvl} House ${get(`prop_${uid}_house`,0)}`) }
      else if(cmd==='leaderboard'){ let keys=Object.keys(db).filter(k=>k.startsWith('money_')).sort((a,b)=>db[b]-db[a]).slice(0,5); let txt=keys.map((k,i)=>`${i+1}. ${k.slice(6,12)}: $${db[k]}`).join('\n'); await send(`🏆 Leaderboard\n${txt||'Empty'}`) }
    }catch(e){ console.log('CMD ERROR', e) }
  })
}
start()
