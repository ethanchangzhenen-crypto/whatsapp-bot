const { default: makeWASocket, useMultiFileAuthState } = require('@whiskeysockets/baileys')
const P = require('pino')
const fs = require('fs')
const express = require('express')
const QRCode = require('qrcode')

const app = express()
let qrCode = null
let connected = false
app.get('/', async (req,res)=>{
  if(connected) return res.send('<h1>✅ BOT - SUNDAY FISH 50 WITH PRIZE $15K</h1>')
  if(qrCode){ let img=await QRCode.toDataURL(qrCode); return res.send(`<center><h1>SCAN</h1><img src="${img}" style="width:350px"><script>setTimeout(()=>location.reload(),20000)</script></center>`) }
  res.send('Starting...')
})
app.listen(process.env.PORT||3000)

let db={}; try{db=JSON.parse(fs.readFileSync('./database.json'))}catch{db={}}
function save(){fs.writeFileSync('./database.json',JSON.stringify(db,null,2))}
function get(k,d){return db[k]!==undefined?db[k]:d}
function set(k,v){db[k]=v;save()}
function add(k,v){db[k]=(db[k]||0)+v;save();return db[k]}
function makeBar(c,g){let p=Math.min(Math.floor(c/g*100),100);let f=Math.floor(p/10);return `[${"█".repeat(f)}${"░".repeat(10-f)}] ${p}%`;}
function getBoost(l){return 1+(l*0.15);}
function getToday(){return ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'][new Date().getDay()]}
function isAdmin(uid, from){ let a=get(`admins_${from}`,[]); let g=get(`global_admins`,[]); if(g.length===0) return false; return a.includes(uid)||g.includes(uid) }
function isBotEnabled(from){ return get(`bot_enabled_${from}`, true) }

const cropTypes = {
  wheat: { time: 60, price: 500, emoji: "🌾" },
  corn: { time: 120, price: 1000, emoji: "🌽" },
  carrot: { time: 180, price: 1500, emoji: "🥕" },
  tomato: { time: 300, price: 3000, emoji: "🍅" },
  goldencrop: { time: 600, price: 10000, emoji: "🌟" }
}

const challenges = {
  monday:{name:"Gambling",goal:20},
  tuesday:{name:"Farm Easy",goal:10000},
  wednesday:{name:"Farm Hard",goal:25000},
  thursday:{name:"Pet Care",goal:100},
  friday:{name:"Fishing",goal:200},
  saturday:{name:"Hunt Day",goal:50},
  sunday:{name:"FISH RACE 50",goal:50, prize:15000, desc:"First to fish 50 fish WINS $15k + LVL!"}
}

const cooldowns = { harvest:60, fish:15, hunt:30, slots:5, cf:5, dice:5, race:20, pet:10, daily:86400, plant:5, stocks:5, qr:5 }
let userCooldowns = {}
function checkCooldown(uid, cmd){ let key=`${uid}_${cmd}`; let now=Date.now()/1000; if(userCooldowns[key]&&userCooldowns[key]>now) return Math.ceil(userCooldowns[key]-now); return 0 }
function setCooldown(uid, cmd){ let key=`${uid}_${cmd}`; let cd=cooldowns[cmd]||3; userCooldowns[key]=Date.now()/1000+cd }

async function start(){
  const { state, saveCreds } = await useMultiFileAuthState('./auth')
  const sock = makeWASocket({ auth: state, logger: P({level:'silent'}) })
  sock.ev.on('creds.update', saveCreds)
  sock.ev.on('connection.update', ({connection, qr})=>{
    if(qr){ qrCode=qr }
    if(connection==='open'){ connected=true; qrCode=null; console.log('✅ CONNECTED') }
    if(connection==='close'){ connected=false; setTimeout(start,2000) }
  })

  sock.ev.on('messages.upsert', async ({messages})=>{
    try{
      const msg = messages[0]
      if(!msg || !msg.message) return
      if(msg.key.remoteJid === 'status@broadcast') return
      let text = msg.message.conversation || msg.message.extendedTextMessage?.text || msg.message.imageMessage?.caption || ""
      if(!text.startsWith('!')) return
      const from = msg.key.remoteJid
      const args = text.slice(1).trim().split(/ +/)
      const cmd = args.shift().toLowerCase()
      const uid = msg.key.participant || msg.key.remoteJid
      let bal = get(`money_${uid}`,1000)
      let lvl = get(`level_${uid}`,1)
      let exp = get(`exp_${uid}`,0)
      let today = getToday()
      const send = async (t) => { await sock.sendMessage(from, {text:t}, {quoted: msg}) }

      if(cmd==='resetadmin'){
        let g=get(`global_admins`,[])
        if(g.length===0 || args[0]==='force' || g.includes(uid)){
          set(`global_admins`,[]); set(`admins_${from}`,[]); set(`banned_${from}`,[]); set(`bot_enabled_${from}`,true)
          return send(`♻️ RESET DONE! Send !admin`)
        } else return send(`❌ Main admin only`)
      }
      if(cmd==='admin'){
        let g=get(`global_admins`,[])
        if(args[0]==='reset'){ if(g.length>0 && !isAdmin(uid,from)) return send(`❌ Admin only`); set(`global_admins`,[]); set(`admins_${from}`,[]); return send(`♻️ Reset!`) }
        if(args[0]==='add'){ if(g.length>0 && !isAdmin(uid,from)) return send(`❌ Admin only`); let m=msg.message.extendedTextMessage?.contextInfo?.mentionedJid?.[0]||args[1]; let admins=get(`admins_${from}`,[]); if(!admins.includes(m)){admins.push(m); set(`admins_${from}`,admins)} let global=get(`global_admins`,[]); if(!global.includes(m)){global.push(m); set(`global_admins`,global)} return send(`✅ Added ${m}`) }
        if(args[0]==='list'){ let a=get(`admins_${from}`,[]); let gg=get(`global_admins`,[]); if(gg.length===0) return send(`👑 No admins!`); return send(`👑 Group: ${a.join(',')||'None'}\nGlobal: ${gg.join(',')}`) }
        if(g.length===0){ set(`global_admins`,[uid]); set(`admins_${from}`,[uid]); return send(`👑 You are MAIN ADMIN!`) }
        else { if(isAdmin(uid,from)) return send(`👑 You are admin!`); else return send(`❌ Admins exist`) }
      }
      if(cmd==='on' || cmd==='off' || cmd==='ban' || cmd==='unban'){
        if(!isAdmin(uid,from)){ let g=get(`global_admins`,[]); if(g.length===0) return send(`❌ No admin! !admin first`); return send(`❌ Admin only!`) }
      }
      if(cmd==='off'){ set(`bot_enabled_${from}`,false); return send(`🔴 BOT OFF`) }
      if(cmd==='on'){ set(`bot_enabled_${from}`,true); return send(`🟢 BOT ON`) }
      if(cmd==='ban'){ let m=msg.message.extendedTextMessage?.contextInfo?.mentionedJid?.[0]||args[0]; let b=get(`banned_${from}`,[]); b.push(m); set(`banned_${from}`,b); return send(`🔨 Banned ${m}`) }
      if(cmd==='unban'){ let m=msg.message.extendedTextMessage?.contextInfo?.mentionedJid?.[0]||args[0]; let b=get(`banned_${from}`,[]).filter(a=>a!==m); set(`banned_${from}`,b); return send(`✅ Unbanned ${m}`) }
      if(!isBotEnabled(from) && cmd!=='on' && cmd!=='admin' && cmd!=='resetadmin') return
      if(get(`banned_${from}`,[]).includes(uid)) return

      if(cmd==='menu'||cmd==='help'){
        await send(`💰 *ECONOMY RPG*
Bal $${bal} LVL${lvl}
Today: ${today} - ${challenges[today].name}

🎰 !cf heads 100
🎰 !slots 100
🎲 !dice 3 100
🌾 !farm
🌱 !plant wheat / !harvest wheat (60s)
🎣 !fish (15s) / !fish sell
👹 !hunt / !level
🐾 !pet / !pet buy dog
🏠 !properties / !buy house
📈 !stocks / !stocks buy TSLA 1
🏁 !race
💵 !balance !daily !inventory !challenge !leaderboard

🏆 TODAY ${today.toUpperCase()}: ${challenges[today].name}
Goal ${challenges[today].goal} - ${challenges[today].desc||''} ${today==='sunday'?'Prize $15k + LVL!':''}
👑 ADMIN: !admin !on !off !ban`)
      }
      else if(cmd==='balance'||cmd==='bal'){ await send(`💵 Balance: $${bal}\nLVL${lvl} EXP ${exp}/1000`) }
      else if(cmd==='level'){ await send(`📈 LVL${lvl} EXP ${exp}/1000 ${makeBar(exp,1000)} Boost ${getBoost(lvl).toFixed(1)}x`) }
      else if(cmd==='challenge'){
        let personal=get(`challenge_${uid}_${today}`,0)
        let goal=challenges[today].goal
        if(today==='sunday'){
          let winner=get(`sunday_fish_winner_${new Date().toDateString()}`,null)
          let txt=`🏁 *SUNDAY FISH RACE - FIRST TO 50 FISH!*\n🎁 PRIZE: $15,000 + 500 EXP + LEVEL BOOST!\n\n🎣 You: ${personal}/${goal} ${makeBar(personal,goal)}\n${personal>=goal?'🏆 YOU REACHED 50!':`⏳ Need ${goal-personal} more fish!`}\n\n`
          if(winner) txt+=`🏆 Today's winner: ${winner.slice(0,14)} - Won $15k!\n`
          else txt+=`🏆 No winner yet! First to 50 wins $15k!\n`
          txt+=`\nDo !fish every 15s`
          await send(txt)
        } else {
          await send(`📅 ${today.toUpperCase()} ${challenges[today].name}\nProgress ${personal}/${goal} ${makeBar(personal,goal)}`)
        }
      }
      else if(cmd==='inventory'||cmd==='inv'){
        let crops=get(`crops_${uid}`,{}); let ct=Object.keys(crops).length?Object.keys(crops).map(k=>`${k}x${crops[k].count}`).join(','):'None'
        await send(`🎒 Bal $${bal} Fish ${get(`fish_${uid}`,0)} Pet ${get(`pet_${uid}`,'none')} Crops ${ct}`)
      }
      else if(cmd==='leaderboard'){ let keys=Object.keys(db).filter(k=>k.startsWith('money_')).sort((a,b)=>db[b]-db[a]).slice(0,5); let txt=keys.map((k,i)=>`${i+1}. ${k.slice(6,14)}: $${db[k]}`).join('\n'); await send(`🏆 Leaderboard\n${txt||'Empty'}`) }
      else if(cmd==='farm'){
        let crops=get(`crops_${uid}`,{}); let txt=`🌾 *YOUR FARM* Bal $${bal}\n\n`; let has=false
        for(let type in cropTypes){ if(crops[type]){ has=true; let cfg=cropTypes[type]; let elapsed=(Date.now()-crops[type].plantedAt)/1000; if(elapsed>=cfg.time) txt+=`${cfg.emoji} ${type.toUpperCase()} ✅ READY! !harvest ${type}\n`; else txt+=`${cfg.emoji} ${type.toUpperCase()} ⏳ ${Math.ceil(cfg.time-elapsed)}s\n`; } }
        if(!has) txt+=`No crops! !plant wheat\n`; txt+=`\n🌱 !plant wheat/corn/carrot/tomato/goldencrop\n🌾 !harvest <crop> (60s)\n`; for(let t in cropTypes) txt+=`${cropTypes[t].emoji} ${t} $${cropTypes[t].price} ${cropTypes[t].time}s\n`; await send(txt)
      }
      else if(cmd==='plant'){
        let left=checkCooldown(uid,'plant'); if(left>0) return send(`⏳ Plant ${left}s`)
        let type=args[0]?.toLowerCase(); if(!type||!cropTypes[type]) return send(`🌱 !plant wheat`)
        let crops=get(`crops_${uid}`,{}); if(crops[type]){ let cfg=cropTypes[type]; let e=(Date.now()-crops[type].plantedAt)/1000; if(e<cfg.time) return send(`⏳ ${type} growing ${Math.ceil(cfg.time-e)}s`); else return send(`✅ ${type} READY! !harvest first`) }
        crops[type]={plantedAt:Date.now(),count:1}; set(`crops_${uid}`,crops); setCooldown(uid,'plant'); await send(`${cropTypes[type].emoji} Planted ${type.toUpperCase()}! ${cropTypes[type].time}s`)
      }
      else if(cmd==='harvest'||cmd==='hervest'){
        let left=checkCooldown(uid,'harvest'); if(left>0) return send(`⏳ Harvest ${left}s`)
        let type=args[0]?.toLowerCase(); if(!type) return send(`🌾 !harvest wheat`); if(!cropTypes[type]) return send(`❌ Unknown ${type}`)
        let crops=get(`crops_${uid}`,{}); if(!crops[type]) return send(`❌ No ${type}`); let cfg=cropTypes[type]; let e=(Date.now()-crops[type].plantedAt)/1000; if(e<cfg.time) return send(`⏳ Not ready ${Math.ceil(cfg.time-e)}s`)
        let earn=Math.floor(cfg.price*crops[type].count*getBoost(lvl)); let nb=add(`money_${uid}`,earn); delete crops[type]; set(`crops_${uid}`,crops); setCooldown(uid,'harvest'); await send(`${cfg.emoji} HARVESTED +$${earn}\n💰 New Bal: $${nb}\n⏳ Next 60s`)
      }
      else if(cmd==='cf'){
        let left=checkCooldown(uid,'cf'); if(left>0) return send(`⏳ Wait ${left}s`)
        let choice=args[0]; let bet=parseInt(args[1])||100; if(!choice) return send(`!cf heads 100`); if(bal<bet) return send(`Need $${bet} have $${bal}`)
        let res=Math.random()>0.5?'heads':'tails'
        if(choice===res){ let win=Math.floor(bet*getBoost(lvl)); let nb=add(`money_${uid}`,win); setCooldown(uid,'cf'); await send(`🪙 ${res.toUpperCase()} WIN +$${win}\n💰 New Bal: $${nb}`) }
        else{ let nb=add(`money_${uid}`,-bet); setCooldown(uid,'cf'); await send(`🪙 ${res.toUpperCase()} LOSE -$${bet}\n💰 New Bal: $${nb}`) }
      }
      else if(cmd==='slots'){
        let left=checkCooldown(uid,'slots'); if(left>0) return send(`⏳ Wait ${left}s`)
        let bet=parseInt(args[0])||100; if(bal<bet) return send(`Need $${bet} have $${bal}`)
        let s=['🍒','🍋','💎','7️⃣','🍀']; let a=s[Math.floor(Math.random()*5)],b=s[Math.floor(Math.random()*5)],c=s[Math.floor(Math.random()*5)]
        if(a===b&&b===c){ let nb=add(`money_${uid}`,bet*5); setCooldown(uid,'slots'); await send(`🎰 [ ${a} | ${b} | ${c} ] JACKPOT!\n+$${bet*5}\n💰 New Bal: $${nb}`) }
        else{ let nb=add(`money_${uid}`,-bet); setCooldown(uid,'slots'); await send(`🎰 [ ${a} | ${b} | ${c} ] LOSE -$${bet}\n💰 New Bal: $${nb}`) }
      }
      else if(cmd==='dice'){
        let left=checkCooldown(uid,'dice'); if(left>0) return send(`⏳ Wait ${left}s`)
        let guess=parseInt(args[0]); let bet=parseInt(args[1])||100; if(!guess) return send(`!dice 3 100`); let roll=Math.floor(Math.random()*6)+1
        if(guess===roll){ let nb=add(`money_${uid}`,bet*3); setCooldown(uid,'dice'); await send(`🎲 Rolled ${roll} WIN +$${bet*3}\n💰 New Bal: $${nb}`) }
        else{ let nb=add(`money_${uid}`,-bet); setCooldown(uid,'dice'); await send(`🎲 Rolled ${roll} LOSE -$${bet}\n💰 New Bal: $${nb}`) }
      }
      else if(cmd==='fish'){
        if(args[0]==='sell'){ let f=get(`fish_${uid}`,0); if(f==0) return send(`No fish!`); let nb=add(`money_${uid}`,f*50); set(`fish_${uid}`,0); await send(`🎣 Sold ${f} +$${f*50}\n💰 New Bal: $${nb}`) }
        else if(args[0]==='inv'){ await send(`🎣 Fish ${get(`fish_${uid}`,0)}`) }
        else{
          let left=checkCooldown(uid,'fish'); if(left>0) return send(`⏳ Fish cooldown ${left}s`)
          add(`fish_${uid}`,1)
          let personal=add(`challenge_${uid}_${today}`,1)
          setCooldown(uid,'fish')
          if(today==='sunday'){
            let winnerKey=`sunday_fish_winner_${new Date().toDateString()}`
            let winner=get(winnerKey,null)
            if(personal>=50 && !winner){
              // PRIZE LOGIC
              let prizeMoney = 15000
              let prizeExp = 500
              let newBal = add(`money_${uid}`, prizeMoney)
              add(`exp_${uid}`, prizeExp)
              let curExp = get(`exp_${uid}`,0)
              let leveled = false
              if(curExp>=1000){ add(`level_${uid}`,1); set(`exp_${uid}`,curExp-1000); leveled=true }
              set(winnerKey, uid)
              await send(`🎣 Caught! ${personal}/50\n\n🏆🏁 YOU ARE FIRST TO FISH 50 ON SUNDAY!\n\n🎁 PRIZE:\n💰 +$${prizeMoney} => New Bal: $${newBal}\n⭐ +${prizeExp} EXP ${leveled?' + LEVEL UP!':''}\nTotal fish: ${get(`fish_${uid}`,0)}\n\n🏆 YOU WIN SUNDAY!`)
            } else if(winner){
              if(winner===uid) await send(`🎣 Caught! ${personal}/50 - You already won today!\nTotal ${get(`fish_${uid}`,0)}\n⏳ Next 15s`)
              else await send(`🎣 Caught! ${personal}/50 ${makeBar(personal,50)}\n🏆 Winner already: ${winner.slice(0,12)} won $15k!\nTotal ${get(`fish_${uid}`,0)}\n⏳ Next 15s`)
            } else {
              await send(`🎣 Caught! ${personal}/50 ${makeBar(personal,50)}\n🏁 SUNDAY RACE - First to 50 wins $15k!\nNeed ${50-personal} more!\nTotal: ${get(`fish_${uid}`,0)}\n⏳ Next 15s`)
            }
          } else {
            await send(`🎣 Caught! Total ${get(`fish_${uid}`,0)}\nProgress ${personal}/${challenges[today].goal} ${makeBar(personal,challenges[today].goal)}\n⏳ Next 15s`)
          }
        }
      }
      else if(cmd==='hunt'){
        let left=checkCooldown(uid,'hunt'); if(left>0) return send(`⏳ Hunt ${left}s`)
        let earn=Math.floor((100+Math.random()*200)*getBoost(lvl)); let nb=add(`money_${uid}`,earn); add(`exp_${uid}`,50); add(`challenge_${uid}_${today}`,1); setCooldown(uid,'hunt')
        let ne=get(`exp_${uid}`,0); if(ne>=1000&&lvl<10){ add(`level_${uid}`,1); set(`exp_${uid}`,0); await send(`👹 +$${earn} LEVEL UP LVL${lvl+1}!\n💰 New Bal: $${nb}`) }
        else await send(`👹 Killed! +$${earn}\n💰 New Bal: $${nb}`)
      }
      else if(cmd==='race'){ let left=checkCooldown(uid,'race'); if(left>0) return send(`⏳ Race ${left}s`); let earn=Math.floor(500*getBoost(lvl)); let nb=add(`money_${uid}`,earn); setCooldown(uid,'race'); await send(`🏁 Race +$${earn} Bal $${nb}`) }
      else if(cmd==='pet'){ let left=checkCooldown(uid,'pet'); if(left>0) return send(`⏳ Pet ${left}s`); if(args[0]==='buy'){ set(`pet_${uid}`,args[1]||'dog'); setCooldown(uid,'pet'); await send(`🐾 Bought ${args[1]||'dog'}!`) } else await send(`🐾 Pet ${get(`pet_${uid}`,'none')}`) }
      else if(cmd==='properties'){ await send(`🏠 House $10k Mansion $50k Hotel $100k\n!buy house`) }
      else if(cmd==='buy'){ let costs={house:10000,mansion:50000,hotel:100000}; let type=args[0]?.toLowerCase(); if(!costs[type]) return send(`!buy house/mansion/hotel`); if(bal<costs[type]) return send(`Need $${costs[type]} Have $${bal}`); add(`money_${uid}`,-costs[type]); add(`prop_${uid}_${type}`,1); await send(`🏠 Bought ${type}!\n💰 New Bal: $${get(`money_${uid}`,0)}`) }
      else if(cmd==='stocks'){ if(args[0]==='buy'){ let p={TSLA:200,AAPL:150,BTC:500}; let sym=args[1]?.toUpperCase()||'TSLA'; let amt=parseInt(args[2])||1; let cost=(p[sym]||200)*amt; if(bal<cost) return send(`Need $${cost}`); add(`money_${uid}`,-cost); add(`stock_${uid}_${sym}`,amt); setCooldown(uid,'stocks'); await send(`📈 Bought ${amt}x ${sym} -$${cost}\n💰 New Bal: $${get(`money_${uid}`,0)}`) } else await send(`📈 TSLA $200 AAPL $150 BTC $500\n!stocks buy TSLA 1`) }
      else if(cmd==='qr'){ let link=args.join(' '); if(!link) return send(`!qr hello`); let url=`https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(link)}`; await sock.sendMessage(from, {image:{url:url}, caption:`📱 QR: ${link}`}, {quoted:msg}) }
      else if(cmd==='daily'){ let last=get(`daily_${uid}`,0); if(Date.now()-last<86400000) return send(`⏰ Daily claimed!`); let nb=add(`money_${uid}`,1000); set(`daily_${uid}`,Date.now()); await send(`🎁 Daily +$1000\n💰 New Bal: $${nb}`) }
    }catch(e){ console.log('ERROR',e) }
  })
}
start()
