const { default: makeWASocket, useMultiFileAuthState } = require('@whiskeysockets/baileys')
const P = require('pino')
const fs = require('fs')
const express = require('express')
const QRCode = require('qrcode')

const app = express()
let qrCode = null
let connected = false
app.get('/', async (req,res)=>{
  if(connected) return res.send('<h1>✅ BOT - ADMIN GIFT/TAKE ADDED</h1>')
  if(qrCode){ let img=await QRCode.toDataURL(qrCode); return res.send(`<center><h1>SCAN</h1><img src="${img}" style="width:350px"><script>setTimeout(()=>location.reload(),20000)</script></center>`) }
  res.send('Starting...')
})
app.listen(process.env.PORT||3000)

let db={}; try{db=JSON.parse(fs.readFileSync('./database.json'))}catch{db={}}
function save(){fs.writeFileSync('./database.json',JSON.stringify(db,null,2))}
function get(k,d){return db[k]!==undefined?db[k]:d}
function set(k,v){db[k]=v;save()}
function add(k,v){
  let current = db[k]||0
  let newVal = current + v
  if(k.startsWith('money_') && newVal < 0) newVal = 0
  db[k]=newVal; save(); return newVal
}
function getMoney(uid){ let m = get(`money_${uid}`,1000); if(m < 0){ set(`money_${uid}`,0); return 0 } return m }
function makeBar(c,g){let p=Math.min(Math.floor(c/g*100),100);let f=Math.floor(p/10);return `[${"█".repeat(f)}${"░".repeat(10-f)}] ${p}%`;}
function getBoost(l){return 1+(l*0.15);}
function getToday(){ return new Date().toLocaleString('en-US', { timeZone: 'Asia/Singapore', weekday: 'long' }).toLowerCase() }
function getTodayDateString(){ return new Date().toLocaleString('en-US', { timeZone: 'Asia/Singapore', year: 'numeric', month: '2-digit', day: '2-digit' }) }
function isAdmin(uid, from){ let a=get(`admins_${from}`,[]); let g=get(`global_admins`,[]); if(g.length===0) return false; return a.includes(uid)||g.includes(uid) }
function isBotEnabled(from){ return get(`bot_enabled_${from}`, true) }

const cropTypes = {
  wheat: { time: 60, price: 250, emoji: "🌾" },
  corn: { time: 120, price: 600, emoji: "🌽" },
  carrot: { time: 180, price: 1000, emoji: "🥕" },
  tomato: { time: 300, price: 1750, emoji: "🍅" },
  goldencrop: { time: 900, price: 2500, emoji: "🌟" }
}
const propTypes = { house:10000, mansion:50000, hotel:100000 }

const challenges = {
  monday:{name:"Gambling Day",goal:20, desc:"Do 20 gambles"},
  tuesday:{name:"Farm Easy",goal:10000},
  wednesday:{name:"Farm Hard",goal:25000},
  thursday:{name:"Pet Care",goal:100},
  friday:{name:"Fishing",goal:200},
  saturday:{name:"Hunt Day",goal:50},
  sunday:{name:"FISH RACE 50",goal:50, prize:15000, desc:"First to fish 50 WINS $15k!"}
}
const cooldowns = { harvest:86400, fish:15, hunt:30, slots:5, cf:5, dice:5, race:20, pet:10, daily:86400, plant:5, stocks:5, qr:5 }
let userCooldowns = {}
function checkCooldown(uid, cmd){ let key=`${uid}_${cmd}`; let now=Date.now()/1000; if(userCooldowns[key]&&userCooldowns[key]>now) return Math.ceil(userCooldowns[key]-now); return 0 }
function setCooldown(uid, cmd){ let key=`${uid}_${cmd}`; let cd=cooldowns[cmd]||3; userCooldowns[key]=Date.now()/1000+cd }

async function start(){
  const { state, saveCreds } = await useMultiFileAuthState('./auth')
  const sock = makeWASocket({ auth: state, logger: P({level:'silent'}) })
  sock.ev.on('creds.update', saveCreds)
  sock.ev.on('connection.update', ({connection, qr})=>{
    if(qr){ qrCode=qr }
    if(connection==='open'){ connected=true; qrCode=null; console.log('✅ CONNECTED', getToday().toUpperCase()) }
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
      let bal = getMoney(uid)
      let lvl = get(`level_${uid}`,1)
      let exp = get(`exp_${uid}`,0)
      let today = getToday()
      const send = async (t) => { await sock.sendMessage(from, {text:t}, {quoted: msg}) }
      const getTarget = () => {
        let mentioned = msg.message.extendedTextMessage?.contextInfo?.mentionedJid?.[0]
        if(mentioned) return mentioned
        // allow ID directly
        if(args[1] && args[1].includes('@')) return args[1]
        if(args[0] && args[0].includes('@')) return args[0]
        return null
      }

      if(cmd==='resetadmin'){
        let g=get(`global_admins`,[])
        if(g.length===0 || args[0]==='force' || g.includes(uid)){
          set(`global_admins`,[]); set(`admins_${from}`,[]); set(`banned_${from}`,[]); set(`bot_enabled_${from}`,true); userCooldowns={}
          return send(`♻️ RESET DONE`)
        } else return send(`❌ Main admin only`)
      }
      if(cmd==='resetcooldown' || cmd==='clearcd'){ if(!isAdmin(uid,from)) return send(`❌ Admin only`); userCooldowns={}; return send(`✅ COOLDOWNS CLEARED`) }

      // ===== ADMIN GIFT / TAKE SYSTEM =====
      if(cmd==='gift' || cmd==='give' || cmd==='take' || cmd==='set'){
        if(!isAdmin(uid,from)) return send(`❌ Admin only! Need !admin first`)
        
        let action = cmd // gift, take, set
        let type = args[0]?.toLowerCase() // money, exp, fish, crop, prop, level, food
        if(!type) return send(`🎁 *ADMIN GIFT/TAKE*\n\n!gift money @user 5000\n!take money @user 1000\n!set money @user 10000\n\nTypes: money, exp, level, fish, crop, prop\n!gift crop wheat @user 5\n!gift prop house @user 1\n!gift exp @user 500`)

        let target = getTarget()
        if(!target){
          // try find target as second arg if first is type
          let possible = msg.message.extendedTextMessage?.contextInfo?.mentionedJid?.[0]
          if(!possible) return send(`❌ Tag user!\nExample: !gift money @user 5000\nMention the user`)
        }
        target = target || msg.message.extendedTextMessage?.contextInfo?.mentionedJid?.[0]

        // Parse amount - look for number in args
        let amount = parseInt(args.find(a=>!isNaN(parseInt(a)) && !a.includes('@'))) || 0
        // For crop: !gift crop wheat @user 5 -> type=crop, cropName=wheat
        if(type==='crop' || type==='crops'){
          let cropName = args[1]?.toLowerCase()
          if(cropName && cropName.startsWith('@')) cropName = null // if they did !gift crop @user 5
          // if format !gift crop wheat @user 5
          if(!cropName || !cropTypes[cropName]){
            // maybe args[1] is @user and they forgot crop name
            return send(`❌ Specify crop!\n!gift crop wheat @user 5\nCrops: wheat, corn, carrot, tomato, goldencrop`)
          }
          let qty = parseInt(args[3]) || parseInt(args[2]) || 1
          if(action==='gift' || action==='give'){
            let crops = get(`crops_${target}`,{})
            if(!crops[cropName]) crops[cropName]={plantedAt:Date.now()-cropTypes[cropName].time, count:0} // ready to harvest
            crops[cropName].count += qty
            set(`crops_${target}`, crops)
            return send(`🎁 GIFTED!\n${cropTypes[cropName].emoji} ${qty}x ${cropName.toUpperCase()} to ${target.slice(0,14)}\nThey can !harvest ${cropName}`)
          } else if(action==='take'){
            let crops = get(`crops_${target}`,{})
            if(crops[cropName]){ crops[cropName].count = Math.max(0, (crops[cropName].count||1)-qty); if(crops[cropName].count===0) delete crops[cropName]; set(`crops_${target}`, crops) }
            return send(`🗑️ TAKEN ${qty}x ${cropName} from ${target.slice(0,14)}`)
          } else if(action==='set'){
            let crops = get(`crops_${target}`,{})
            crops[cropName]={plantedAt:Date.now()-cropTypes[cropName].time, count:qty}
            set(`crops_${target}`, crops)
            return send(`🔧 SET ${target.slice(0,14)} has ${qty}x ${cropName}`)
          }
        }

        if(type==='prop' || type==='property' || type==='properties'){
          let propName = args[1]?.toLowerCase()
          if(propName && propName.startsWith('@')) propName = null
          if(!propName || !propTypes[propName]) return send(`❌ Specify prop!\n!gift prop house @user 1\nProps: house, mansion, hotel`)
          let qty = parseInt(args[3]) || parseInt(args[2]) || 1
          if(action==='gift' || action==='give'){
            add(`prop_${target}_${propName}`, qty)
            return send(`🎁 GIFTED!\n🏠 ${qty}x ${propName.toUpperCase()} to ${target.slice(0,14)}\nNow has ${get(`prop_${target}_${propName}`,0)}`)
          } else if(action==='take'){
            let cur = get(`prop_${target}_${propName}`,0); let newV = Math.max(0, cur-qty); set(`prop_${target}_${propName}`, newV)
            return send(`🗑️ TAKEN ${qty}x ${propName} from ${target.slice(0,14)} - Now ${newV}`)
          } else if(action==='set'){
            set(`prop_${target}_${propName}`, qty)
            return send(`🔧 SET ${target.slice(0,14)} prop ${propName} = ${qty}`)
          }
        }

        if(type==='money' || type==='bal' || type==='cash'){
          if(action==='gift' || action==='give'){
            if(amount<=0) return send(`❌ Amount? !gift money @user 5000`)
            let nb = add(`money_${target}`, amount)
            return send(`🎁 GIFTED $${amount} to ${target.slice(0,14)}\n💰 Their new balance: $${nb}`)
          } else if(action==='take'){
            if(amount<=0) return send(`❌ Amount? !take money @user 1000`)
            let cur = getMoney(target); let takeAmt = Math.min(cur, amount); let nb = add(`money_${target}`, -takeAmt)
            return send(`🗑️ TAKEN $${takeAmt} from ${target.slice(0,14)}\n💰 Their new balance: $${nb} (was $${cur})`)
          } else if(action==='set'){
            set(`money_${target}`, amount)
            return send(`🔧 SET ${target.slice(0,14)} money = $${amount}`)
          }
        }

        if(type==='exp' || type==='xp'){
          if(action==='gift' || action==='give'){
            let nb = add(`exp_${target}`, amount); 
            let curExp = get(`exp_${target}`,0)
            if(curExp>=1000){ add(`level_${target}`,1); set(`exp_${target}`,curExp-1000); return send(`🎁 GIFTED ${amount} EXP to ${target.slice(0,14)} + LEVEL UP! Now LVL${get(`level_${target}`,1)}`) }
            return send(`🎁 GIFTED ${amount} EXP to ${target.slice(0,14)}\n⭐ Their EXP: ${nb}/1000`)
          } else if(action==='take'){
            let cur = get(`exp_${target}`,0); let newV = Math.max(0, cur-amount); set(`exp_${target}`, newV)
            return send(`🗑️ TAKEN ${amount} EXP from ${target.slice(0,14)} - Now ${newV}`)
          } else if(action==='set'){
            set(`exp_${target}`, amount)
            return send(`🔧 SET ${target.slice(0,14)} EXP = ${amount}`)
          }
        }

        if(type==='level' || type==='lvl'){
          if(action==='gift' || action==='give'){
            let nb = add(`level_${target}`, amount)
            return send(`🎁 GIFTED ${amount} LEVEL to ${target.slice(0,14)}\n📈 Now LVL${nb}`)
          } else if(action==='take'){
            let cur = get(`level_${target}`,1); let newV = Math.max(1, cur-amount); set(`level_${target}`, newV)
            return send(`🗑️ TAKEN ${amount} LEVEL from ${target.slice(0,14)} - Now LVL${newV}`)
          } else if(action==='set'){
            set(`level_${target}`, amount)
            return send(`🔧 SET ${target.slice(0,14)} LEVEL = ${amount}`)
          }
        }

        if(type==='fish'){
          if(action==='gift' || action==='give'){
            let nb = add(`fish_${target}`, amount)
            return send(`🎁 GIFTED ${amount} fish to ${target.slice(0,14)}\n🎣 Now has ${nb} fish`)
          } else if(action==='take'){
            let cur = get(`fish_${target}`,0); let newV = Math.max(0, cur-amount); set(`fish_${target}`, newV)
            return send(`🗑️ TAKEN ${amount} fish from ${target.slice(0,14)} - Now ${newV}`)
          } else if(action==='set'){
            set(`fish_${target}`, amount)
            return send(`🔧 SET ${target.slice(0,14)} fish = ${amount}`)
          }
        }

        if(type==='food'){
          // food as generic item or fish as food? Use fish as food for now
          if(action==='gift' || action==='give'){
            add(`fish_${target}`, amount); add(`food_${target}`, amount)
            return send(`🎁 GIFTED ${amount} food to ${target.slice(0,14)}`)
          } else if(action==='take'){
            let cur = get(`food_${target}`,0); set(`food_${target}`, Math.max(0, cur-amount))
            return send(`🗑️ TAKEN ${amount} food from ${target.slice(0,14)}`)
          } else if(action==='set'){
            set(`food_${target}`, amount)
            return send(`🔧 SET ${target.slice(0,14)} food = ${amount}`)
          }
        }

        return send(`❌ Unknown type ${type}\nUse: money, exp, level, fish, crop, prop, food`)
      }
      // ===== END ADMIN GIFT SYSTEM =====

      if(cmd==='admin'){
        let g=get(`global_admins`,[])
        if(args[0]==='reset'){ if(g.length>0 && !isAdmin(uid,from)) return send(`❌ Admin only`); set(`global_admins`,[]); set(`admins_${from}`,[]); return send(`♻️ Reset!`) }
        if(args[0]==='add'){ if(g.length>0 && !isAdmin(uid,from)) return send(`❌ Admin only`); let m=msg.message.extendedTextMessage?.contextInfo?.mentionedJid?.[0]||args[1]; let admins=get(`admins_${from}`,[]); if(!admins.includes(m)){admins.push(m); set(`admins_${from}`,admins)} let global=get(`global_admins`,[]); if(!global.includes(m)){global.push(m); set(`global_admins`,global)} return send(`✅ Added ${m}`) }
        if(args[0]==='list'){ let a=get(`admins_${from}`,[]); let gg=get(`global_admins`,[]); if(gg.length===0) return send(`👑 No admins!`); return send(`👑 Group: ${a.join(',')||'None'}\nGlobal: ${gg.join(',')}`) }
        if(g.length===0){ set(`global_admins`,[uid]); set(`admins_${from}`,[uid]); return send(`👑 You are MAIN ADMIN!`) }
        else { if(isAdmin(uid,from)) return send(`👑 You are admin!`); else return send(`❌ Admins exist`) }
      }
      if(cmd==='on' || cmd==='off' || cmd==='ban' || cmd==='unban' || cmd==='fixmoney' || cmd==='fixtime'){
        if(!isAdmin(uid,from)){ let g=get(`global_admins`,[]); if(g.length===0) return send(`❌ No admin! !admin first`); return send(`❌ Admin only!`) }
      }
      if(cmd==='off'){ set(`bot_enabled_${from}`,false); return send(`🔴 BOT OFF`) }
      if(cmd==='on'){ set(`bot_enabled_${from}`,true); return send(`🟢 BOT ON`) }
      if(cmd==='ban'){ let m=msg.message.extendedTextMessage?.contextInfo?.mentionedJid?.[0]||args[0]; let b=get(`banned_${from}`,[]); b.push(m); set(`banned_${from}`,b); return send(`🔨 Banned ${m}`) }
      if(cmd==='unban'){ let m=msg.message.extendedTextMessage?.contextInfo?.mentionedJid?.[0]||args[0]; let b=get(`banned_${from}`,[]).filter(a=>a!==m); set(`banned_${from}`,b); return send(`✅ Unbanned ${m}`) }
      if(cmd==='fixmoney'){ let all=Object.keys(db).filter(k=>k.startsWith('money_')); let f=0; for(let k of all){ if(db[k]<0){ db[k]=0; f++ }} save(); return send(`🔧 Fixed ${f} negative`) }
      if(cmd==='fixtime'){ return send(`🕒 SG Time: ${new Date().toLocaleString('en-US',{timeZone:'Asia/Singapore'})}\nToday: ${getToday().toUpperCase()}`) }
      if(!isBotEnabled(from) && cmd!=='on' && cmd!=='admin' && cmd!=='resetadmin') return
      if(get(`banned_${from}`,[]).includes(uid)) return

      if(cmd==='menu'||cmd==='help'){
        let chal = challenges[today]
        await send(`💰 *ECONOMY RPG - SG TIME*
Bal $${bal} LVL${lvl}
📅 TODAY: ${today.toUpperCase()} - ${chal.name}
Goal ${chal.goal}

🎰 !cf heads 100 / !slots 100 / !dice 3 100
🌾 !farm / !plant wheat / !harvest wheat (24h)
🎣 !fish (15s) / !fish sell
👹 !hunt / !level
🐾 !pet / !properties / !buy house
📈 !stocks buy TSLA 1
🏁 !race
💵 !balance !daily !inventory !challenge !leaderboard

🏆 ${today.toUpperCase()}: ${chal.name} ${today==='sunday'?'Prize $15k!':''}

👑 *ADMIN GIFT/TAKE NEW!*
!gift money @user 5000
!take money @user 1000
!set money @user 10000
!gift exp @user 500
!gift level @user 2
!gift fish @user 100
!gift crop wheat @user 5
!gift prop house @user 1
!gift food @user 10

!admin !on !off !ban !fixtime
🕒 SG ${new Date().toLocaleTimeString('en-US',{timeZone:'Asia/Singapore'})}
`)
      }
      else if(cmd==='balance'||cmd==='bal'){ await send(`💵 Balance: $${bal}\nLVL${lvl} EXP ${exp}/1000`) }
      else if(cmd==='level'){ await send(`📈 LVL${lvl} EXP ${exp}/1000 ${makeBar(exp,1000)}`) }
      else if(cmd==='challenge'){
        let personal=get(`challenge_${uid}_${today}`,0)
        let goal=challenges[today].goal
        let chal=challenges[today]
        if(today==='sunday'){
          let dateStr=getTodayDateString()
          let winner=get(`sunday_fish_winner_${dateStr}`,null)
          let txt=`🏁 *${today.toUpperCase()}: ${chal.name}* Prize $15k\n🎣 You: ${personal}/${goal} ${makeBar(personal,goal)}\n`
          if(winner) txt+=`🏆 Winner: ${winner.slice(0,14)}\n`; else txt+=`🏆 No winner yet!\n`
          await send(txt)
        } else { await send(`📅 *${today.toUpperCase()}: ${chal.name}*\nProgress ${personal}/${goal} ${makeBar(personal,goal)}`) }
      }
      else if(cmd==='inventory'||cmd==='inv'){
        let crops=get(`crops_${uid}`,{}); let ct=Object.keys(crops).length?Object.keys(crops).map(k=>`${k}x${crops[k].count||1}`).join(','):'None'
        await send(`🎒 Bal $${bal} Fish ${get(`fish_${uid}`,0)} Crops ${ct} Food ${get(`food_${uid}`,0)} Props: house ${get(`prop_${uid}_house`,0)}`)
      }
      else if(cmd==='leaderboard'){ let keys=Object.keys(db).filter(k=>k.startsWith('money_')).sort((a,b)=>db[b]-db[a]).slice(0,5); let txt=keys.map((k,i)=>`${i+1}. ${k.slice(6,14)}: $${db[k]}`).join('\n'); await send(`🏆 Leaderboard\n${txt||'Empty'}`) }
      else if(cmd==='farm'){
        let crops=get(`crops_${uid}`,{}); let txt=`🌾 *YOUR FARM* Bal $${bal} - ${today.toUpperCase()}\n\n`; let has=false
        for(let type in cropTypes){ if(crops[type]){ has=true; let cfg=cropTypes[type]; let elapsed=(Date.now()-crops[type].plantedAt)/1000; if(elapsed>=cfg.time) txt+=`${cfg.emoji} ${type.toUpperCase()} ✅ READY x${crops[type].count||1} !harvest ${type} (+$${cfg.price* (crops[type].count||1)})\n`; else txt+=`${cfg.emoji} ${type.toUpperCase()} ⏳ ${Math.ceil(cfg.time-elapsed)}s left\n`; } }
        if(!has) txt+=`No crops! !plant wheat\n`; txt+=`\n`; for(let t in cropTypes) txt+=`${cropTypes[t].emoji} ${t} $${cropTypes[t].price}\n`; await send(txt)
      }
      else if(cmd==='plant'){
        let left=checkCooldown(uid,'plant'); if(left>0) return send(`⏳ Plant ${left}s`)
        let type=args[0]?.toLowerCase(); if(!type||!cropTypes[type]) return send(`🌱 !plant wheat/corn/carrot/tomato/goldencrop`)
        let crops=get(`crops_${uid}`,{}); if(crops[type]){ let cfg=cropTypes[type]; let e=(Date.now()-crops[type].plantedAt)/1000; if(e<cfg.time) return send(`⏳ ${type} growing ${Math.ceil(cfg.time-e)}s`); else return send(`✅ ${type} READY! !harvest now`) }
        crops[type]={plantedAt:Date.now(),count:1}; set(`crops_${uid}`,crops); setCooldown(uid,'plant'); await send(`${cropTypes[type].emoji} Planted ${type.toUpperCase()}! +$${cropTypes[type].price} after ${cropTypes[type].time}s`)
      }
      else if(cmd==='harvest'||cmd==='hervest'){
        let left=checkCooldown(uid,'harvest'); if(left>0){ let hrs=Math.floor(left/3600); let mins=Math.floor((left%3600)/60); return send(`⏳ HARVEST 24H COOLDOWN: ${hrs}h ${mins}m left`) }
        let type=args[0]?.toLowerCase(); if(!type) return send(`🌾 !harvest wheat - 24h cd!`); if(!cropTypes[type]) return send(`❌ Unknown ${type}`)
        let crops=get(`crops_${uid}`,{}); if(!crops[type]) return send(`❌ No ${type}`); let cfg=cropTypes[type]; let e=(Date.now()-crops[type].plantedAt)/1000; if(e<cfg.time) return send(`⏳ Not ready ${Math.ceil(cfg.time-e)}s more`)
        let qty = crops[type].count||1
        let earn=Math.floor(cfg.price*qty*getBoost(lvl)); let nb=add(`money_${uid}`,earn); delete crops[type]; set(`crops_${uid}`,crops); setCooldown(uid,'harvest'); await send(`${cfg.emoji} HARVESTED ${type.toUpperCase()} x${qty} +$${earn}\n💰 New Bal: $${nb}\n⏰ NEXT IN 24H!`)
      }
      else if(cmd==='cf'){
        let left=checkCooldown(uid,'cf'); if(left>0) return send(`⏳ Wait ${left}s`)
        let choice=args[0]; let bet=parseInt(args[1])||100; if(!choice) return send(`!cf heads 100`); bal=getMoney(uid); if(bal < bet) return send(`❌ Need $${bet} Have $${bal}`); if(bet <= 0) return send(`❌ Bet >0`)
        let res=Math.random()>0.5?'heads':'tails'
        if(choice===res){ let win=Math.floor(bet*getBoost(lvl)); let nb=add(`money_${uid}`,win); add(`challenge_${uid}_${today}`,1); setCooldown(uid,'cf'); await send(`🪙 ${res.toUpperCase()} WIN +$${win}\n💰 New Bal: $${nb}`) }
        else{ let nb=add(`money_${uid}`,-bet); add(`challenge_${uid}_${today}`,1); setCooldown(uid,'cf'); await send(`🪙 ${res.toUpperCase()} LOSE -$${bet}\n💰 New Bal: $${nb}`) }
      }
      else if(cmd==='slots'){
        let left=checkCooldown(uid,'slots'); if(left>0) return send(`⏳ Wait ${left}s`)
        let bet=parseInt(args[0])||100; bal=getMoney(uid); if(bal < bet) return send(`❌ Need $${bet} Have $${bal}`); if(bet <= 0) return send(`❌ Bet >0`)
        let s=['🍒','🍋','💎','7️⃣','🍀']; let a=s[Math.floor(Math.random()*5)],b=s[Math.floor(Math.random()*5)],c=s[Math.floor(Math.random()*5)]
        if(a===b&&b===c){ let nb=add(`money_${uid}`,bet*5); add(`challenge_${uid}_${today}`,1); setCooldown(uid,'slots'); await send(`🎰 [ ${a} | ${b} | ${c} ] JACKPOT +$${bet*5}\n💰 New Bal: $${nb}`) }
        else{ let nb=add(`money_${uid}`,-bet); add(`challenge_${uid}_${today}`,1); setCooldown(uid,'slots'); await send(`🎰 [ ${a} | ${b} | ${c} ] LOSE -$${bet}\n💰 New Bal: $${nb}`) }
      }
      else if(cmd==='dice'){
        let left=checkCooldown(uid,'dice'); if(left>0) return send(`⏳ Wait ${left}s`)
        let guess=parseInt(args[0]); let bet=parseInt(args[1])||100; bal=getMoney(uid); if(bal < bet) return send(`❌ Need $${bet} Have $${bal}`); if(bet <= 0) return send(`❌ Bet >0`); if(!guess) return send(`!dice 3 100`); let roll=Math.floor(Math.random()*6)+1
        if(guess===roll){ let nb=add(`money_${uid}`,bet*3); add(`challenge_${uid}_${today}`,1); setCooldown(uid,'dice'); await send(`🎲 Rolled ${roll} WIN +$${bet*3}\n💰 New Bal: $${nb}`) }
        else{ let nb=add(`money_${uid}`,-bet); add(`challenge_${uid}_${today}`,1); setCooldown(uid,'dice'); await send(`🎲 Rolled ${roll} LOSE -$${bet}\n💰 New Bal: $${nb}`) }
      }
      else if(cmd==='fish'){
        if(args[0]==='sell'){ let f=get(`fish_${uid}`,0); if(f==0) return send(`No fish!`); let nb=add(`money_${uid}`,f*50); set(`fish_${uid}`,0); await send(`🎣 Sold ${f} +$${f*50}\n💰 New Bal: $${nb}`) }
        else if(args[0]==='inv'){ await send(`🎣 Fish ${get(`fish_${uid}`,0)}`) }
        else{
          let left=checkCooldown(uid,'fish'); if(left>0) return send(`⏳ Fish ${left}s`)
          add(`fish_${uid}`,1); let personal=add(`challenge_${uid}_${today}`,1); setCooldown(uid,'fish')
          if(today==='sunday'){
            let dateStr=getTodayDateString()
            let winnerKey=`sunday_fish_winner_${dateStr}`; let winner=get(winnerKey,null)
            if(personal>=50 && !winner){
              let prizeMoney=15000; let prizeExp=500; let newBal=add(`money_${uid}`, prizeMoney); add(`exp_${uid}`, prizeExp)
              let curExp=get(`exp_${uid}`,0); if(curExp>=1000){ add(`level_${uid}`,1); set(`exp_${uid}`,curExp-1000) }
              set(winnerKey, uid); await send(`🎣 ${personal}/50\n\n🏆 FIRST TO 50 ON SUNDAY! WIN!\n🎁 +$${prizeMoney} New Bal: $${newBal}`)
            } else if(winner){ await send(`🎣 ${personal}/50 ${makeBar(personal,50)}\n🏆 Winner: ${winner.slice(0,12)}`) }
            else { await send(`🎣 ${personal}/50 ${makeBar(personal,50)}\n🏁 First to 50 wins $15k! Need ${50-personal}\n⏳ 15s`) }
          } else { await send(`🎣 Caught! Total ${get(`fish_${uid}`,0)}\n📅 ${today.toUpperCase()} ${personal}/${challenges[today].goal}\n⏳ 15s`) }
        }
      }
      else if(cmd==='hunt'){ let left=checkCooldown(uid,'hunt'); if(left>0) return send(`⏳ Hunt ${left}s`); let earn=Math.floor((100+Math.random()*200)*getBoost(lvl)); let nb=add(`money_${uid}`,earn); add(`exp_${uid}`,50); add(`challenge_${uid}_${today}`,1); setCooldown(uid,'hunt'); let ne=get(`exp_${uid}`,0); if(ne>=1000&&lvl<10){ add(`level_${uid}`,1); set(`exp_${uid}`,0); await send(`👹 +$${earn} LEVEL UP LVL${lvl+1}!\n💰 New Bal: $${nb}`) } else await send(`👹 Killed! +$${earn}\n💰 New Bal: $${nb}`) }
      else if(cmd==='race'){ let left=checkCooldown(uid,'race'); if(left>0) return send(`⏳ Race ${left}s`); let earn=Math.floor(500*getBoost(lvl)); let nb=add(`money_${uid}`,earn); setCooldown(uid,'race'); await send(`🏁 Race +$${earn} Bal $${nb}`) }
      else if(cmd==='pet'){ let left=checkCooldown(uid,'pet'); if(left>0) return send(`⏳ Pet ${left}s`); if(args[0]==='buy'){ let cost=5000; bal=getMoney(uid); if(bal<cost) return send(`❌ Need $${cost} Have $${bal}`); add(`money_${uid}`,-cost); set(`pet_${uid}`,args[1]||'dog'); setCooldown(uid,'pet'); await send(`🐾 Bought ${args[1]||'dog'} -$${cost}\n💰 New Bal: $${getMoney(uid)}`) } else await send(`🐾 Pet ${get(`pet_${uid}`,'none')}`) }
      else if(cmd==='properties'){ await send(`🏠 House $10k Mansion $50k Hotel $100k\n!buy house`) }
      else if(cmd==='buy'){ let costs={house:10000,mansion:50000,hotel:100000}; let type=args[0]?.toLowerCase(); if(!costs[type]) return send(`!buy house/mansion/hotel`); bal=getMoney(uid); if(bal<costs[type]) return send(`❌ Need $${costs[type]} Have $${bal}`); add(`money_${uid}`,-costs[type]); add(`prop_${uid}_${type}`,1); await send(`🏠 Bought ${type}!\n💰 New Bal: $${getMoney(uid)}`) }
      else if(cmd==='stocks'){ if(args[0]==='buy'){ let p={TSLA:200,AAPL:150,BTC:500}; let sym=args[1]?.toUpperCase()||'TSLA'; let amt=parseInt(args[2])||1; if(amt<=0) return send(`❌ Amount >0`); let cost=(p[sym]||200)*amt; bal=getMoney(uid); if(bal<cost) return send(`❌ Need $${cost} Have $${bal}`); add(`money_${uid}`,-cost); add(`stock_${uid}_${sym}`,amt); setCooldown(uid,'stocks'); await send(`📈 Bought ${amt}x ${sym} -$${cost}\n💰 New Bal: $${getMoney(uid)}`) } else await send(`📈 TSLA $200 AAPL $150 BTC $500\n!stocks buy TSLA 1`) }
      else if(cmd==='qr'){ let link=args.join(' '); if(!link) return send(`!qr hello`); let url=`https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(link)}`; await sock.sendMessage(from, {image:{url:url}, caption:`📱 QR: ${link}`}, {quoted:msg}) }
      else if(cmd==='daily'){ let last=get(`daily_${uid}`,0); if(Date.now()-last<86400000) return send(`⏰ Daily claimed! ${Math.ceil((86400000-(Date.now()-last))/3600000)}h left`); let nb=add(`money_${uid}`,1000); set(`daily_${uid}`,Date.now()); await send(`🎁 Daily +$1000\n💰 New Bal: $${nb}`) }
    }catch(e){ console.log('ERROR',e) }
  })
}
start()
