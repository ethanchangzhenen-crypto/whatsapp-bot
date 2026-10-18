const { default: makeWASocket, useMultiFileAuthState } = require('@whiskeysockets/baileys')
const P = require('pino')
const fs = require('fs')
const express = require('express')
const QRCode = require('qrcode')

const app = express()
let qrCode = null
let connected = false
app.get('/', async (req,res)=>{
  if(connected) return res.send('<h1>✅ BOT CONNECTED - ADMIN SYSTEM ACTIVE</h1><p>Commands: !admin !on !off !menu</p>')
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
function getToday(){return ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'][new Date().getDay()]}
function isAdmin(uid, from){
  let admins = get(`admins_${from}`, [])
  let globalAdmins = get(`global_admins`, [])
  if(globalAdmins.length===0) return true
  return admins.includes(uid) || globalAdmins.includes(uid)
}
function isBotEnabled(from){ return get(`bot_enabled_${from}`, true) }

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

      // ADMIN COMMANDS
      if(cmd==='off' || cmd==='disable'){
        if(!isAdmin(uid, from)) return send(`❌ Admin only - Use !admin first`)
        set(`bot_enabled_${from}`, false)
        return send(`🔴 BOT OFF\nThis group bot disabled\nType !on to enable`)
      }
      if(cmd==='on' || cmd==='enable'){
        if(!isAdmin(uid, from)) return send(`❌ Admin only`)
        set(`bot_enabled_${from}`, true)
        return send(`🟢 BOT ON\nBot enabled! Try !menu`)
      }
      if(cmd==='admin'){
        if(args[0]==='add'){
          let mention = msg.message.extendedTextMessage?.contextInfo?.mentionedJid?.[0] || args[1]
          if(!mention) return send(`Use: !admin add @user (tag someone)`)
          let admins = get(`admins_${from}`, []); if(!admins.includes(mention)){ admins.push(mention); set(`admins_${from}`, admins) }
          let global = get(`global_admins`, []); if(!global.includes(mention)){ global.push(mention); set(`global_admins`, global) }
          return send(`✅ Added admin: ${mention}`)
        }
        if(args[0]==='list'){
          let admins = get(`admins_${from}`, []); let global = get(`global_admins`, [])
          return send(`👑 Admins:\nGroup: ${admins.join(', ')||'None'}\nGlobal: ${global.join(', ')||'None'}`)
        }
        if(args[0]==='remove'){
          let mention = msg.message.extendedTextMessage?.contextInfo?.mentionedJid?.[0] || args[1]
          let admins = get(`admins_${from}`, []).filter(a=>a!==mention); set(`admins_${from}`, admins)
          return send(`❌ Removed ${mention}`)
        }
        let global = get(`global_admins`, [])
        if(global.length===0){
          set(`global_admins`, [uid]); set(`admins_${from}`, [uid])
          return send(`👑 You are now MAIN ADMIN!\n\n!on - Turn ON\n!off - Turn OFF\n!admin add @user\n!admin list\n!ban @user\n!clear`)
        }
        return send(`👑 ADMIN:\n!on / !off\n!admin add @user\n!admin list\n!ban @user\n!unban @user\n!clear @user`)
      }
      if(cmd==='ban'){
        if(!isAdmin(uid, from)) return send(`❌ Admin only`)
        let mention = msg.message.extendedTextMessage?.contextInfo?.mentionedJid?.[0] || args[0]
        let banned = get(`banned_${from}`, []); banned.push(mention); set(`banned_${from}`, banned)
        return send(`🔨 Banned ${mention}`)
      }
      if(cmd==='unban'){
        if(!isAdmin(uid, from)) return send(`❌ Admin only`)
        let mention = msg.message.extendedTextMessage?.contextInfo?.mentionedJid?.[0] || args[0]
        let banned = get(`banned_${from}`, []).filter(a=>a!==mention); set(`banned_${from}`, banned)
        return send(`✅ Unbanned ${mention}`)
      }
      if(cmd==='clear'){
        if(!isAdmin(uid, from)) return send(`❌ Admin only`)
        let mention = msg.message.extendedTextMessage?.contextInfo?.mentionedJid?.[0] || args[0] || uid
        set(`money_${mention}`,1000); set(`fish_${mention}`,0); set(`level_${mention}`,1)
        return send(`🗑️ Cleared ${mention} to $1000`)
      }

      if(!isBotEnabled(from) && cmd!=='on' && cmd!=='admin') return
      let bannedList = get(`banned_${from}`, [])
      if(bannedList.includes(uid)) return

      if(cmd==='menu'||cmd==='help'){
        await send(`💰 *ECONOMY RPG*
Bal $${bal} LVL${lvl} ${getBoost(lvl).toFixed(1)}x
Today: ${today}

🎰 !cf heads 100
🎰 !slots 100
🎲 !dice 3 100
🌾 !farm
🎣 !fish / !fish sell / !fish inv
👹 !hunt / !level
🏠 !properties / !buy house
📈 !stocks / !stocks buy TSLA 1
🏁 !race
📱 !qr hello
💵 !balance !daily !inventory !challenge !leaderboard

👑 ADMIN: !admin !on !off !ban`)
      }
      else if(cmd==='balance'||cmd==='bal'){ await send(`💵 Balance: $${bal}\nLVL${lvl} EXP ${exp}/1000 ${makeBar(exp,1000)}\nBoost ${getBoost(lvl).toFixed(1)}x`) }
      else if(cmd==='level'){ await send(`📈 LVL ${lvl} EXP ${exp}/1000 ${makeBar(exp,1000)}\nBoost ${getBoost(lvl)}x LVL10=2.5x`) }
      else if(cmd==='challenge'){ let prog=get(`challenge_${today}`,0); await send(`📅 ${today} ${prog} ${makeBar(prog,100)}`) }
      else if(cmd==='qr'){ let link=args.join(' '); if(!link) return send('!qr hello'); let url=`https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(link)}`; await sock.sendMessage(from, {image:{url:url}, caption:`📱 QR: ${link}`}, {quoted:msg}) }
      else if(cmd==='cf'){
        let bet=parseInt(args[1])||100; if(bal<bet) return send(`Need $${bet} have $${bal}`)
        let res=Math.random()>0.5?'heads':'tails'
        if(args[0]===res){ let nb=add(`money_${uid}`,bet); await send(`🪙 ${res.toUpperCase()} WIN +$${bet}\n💰 New Balance: $${nb}`) }
        else{ let nb=add(`money_${uid}`,-bet); await send(`🪙 ${res.toUpperCase()} LOSE -$${bet}\n💰 New Balance: $${nb}`) }
      }
      else if(cmd==='slots'){
        let bet=parseInt(args[0])||100; if(bal<bet) return send(`Need $${bet} have $${bal}`)
        let s=['🍒','🍋','💎','7️⃣','🍀']; let a=s[Math.floor(Math.random()*5)],b=s[Math.floor(Math.random()*5)],c=s[Math.floor(Math.random()*5)]
        if(a===b&&b===c){ let nb=add(`money_${uid}`,bet*5); await send(`🎰 [ ${a} | ${b} | ${c} ] JACKPOT!\n+$${bet*5}\n💰 New Balance: $${nb}`) }
        else{ let nb=add(`money_${uid}`,-bet); await send(`🎰 [ ${a} | ${b} | ${c} ] LOSE -$${bet}\n💰 New Balance: $${nb}`) }
      }
      else if(cmd==='dice'){
        let guess=parseInt(args[0]); let bet=parseInt(args[1])||100; let roll=Math.floor(Math.random()*6)+1
        if(guess===roll){ let nb=add(`money_${uid}`,bet*3); await send(`🎲 Rolled ${roll} WIN +$${bet*3}\n💰 New Balance: $${nb}`) }
        else{ let nb=add(`money_${uid}`,-bet); await send(`🎲 Rolled ${roll} LOSE -$${bet}\n💰 New Balance: $${nb}`) }
      }
      else if(cmd==='farm'){ let nb=add(`money_${uid}`,Math.floor(250*getBoost(lvl))); await send(`🌾 Farmed +$250\n💰 New Balance: $${nb}`) }
      else if(cmd==='crops'){ if(args[0]==='plant'){ set(`crop_${uid}`,Date.now()); await send(`🌱 Planted!`) } else await send(`🌱 !crops plant wheat`) }
      else if(cmd==='pet'){ if(args[0]==='buy'){ set(`pet_${uid}`,args[1]||'dog'); await send(`🐾 Bought ${args[1]||'dog'}!`) } else await send(`🐾 Pet ${get(`pet_${uid}`,'none')} - !pet feed/play/buy`) }
      else if(cmd==='fish'){ if(args[0]==='sell'){ let f=get(`fish_${uid}`,0); let nb=add(`money_${uid}`,f*50); set(`fish_${uid}`,0); await send(`🎣 Sold ${f} fish +$${f*50}\n💰 New Balance: $${nb}`) } else { add(`fish_${uid}`,1); await send(`🎣 Caught! Total ${get(`fish_${uid}`,0)} Bal $${bal}`) } }
      else if(cmd==='hunt'){ let earn=Math.floor(150*getBoost(lvl)); let nb=add(`money_${uid}`,earn); add(`exp_${uid}`,50); await send(`👹 Killed! +$${earn}\n💰 New Balance: $${nb} EXP ${get(`exp_${uid}`,0)}/1000`) }
      else if(cmd==='properties'){ await send(`🏠 House $10k Mansion $50k Hotel $100k\n!buy house`) }
      else if(cmd==='buy'){ let costs={house:10000,mansion:50000,hotel:100000}; let type=args[0]; if(!costs[type]) return send(`!buy house/mansion/hotel`); if(bal<costs[type]) return send(`Need $${costs[type]} Have $${bal}`); add(`money_${uid}`,-costs[type]); add(`prop_${uid}_${type}`,1); await send(`🏠 Bought ${type}!\n💰 New Balance: $${get(`money_${uid}`,0)}`) }
      else if(cmd==='stocks'){ if(args[0]==='buy'){ let prices={TSLA:200,AAPL:150,BTC:500}; let sym=args[1]?.toUpperCase()||'TSLA'; let amt=parseInt(args[2])||1; let cost=(prices[sym]||200)*amt; if(bal<cost) return send(`Need $${cost}`); add(`money_${uid}`,-cost); add(`stock_${uid}_${sym}`,amt); await send(`📈 Bought ${amt}x ${sym} -$${cost}\n💰 New Balance: $${get(`money_${uid}`,0)}`) } else await send(`📈 TSLA $200 AAPL $150 BTC $500\n!stocks buy TSLA 1`) }
      else if(cmd==='race'){ add(`challenge_${today}`,1); await send(`🏁 Race done! ${get(`challenge_${today}`,0)}/5 ${makeBar(get(`challenge_${today}`,0),5)}`) }
      else if(cmd==='daily'){ let last=get(`daily_${uid}`,0); if(Date.now()-last<86400000) return send(`⏰ Already claimed`); let nb=add(`money_${uid}`,1000); set(`daily_${uid}`,Date.now()); await send(`🎁 Daily +$1000\n💰 New Balance: $${nb}`) }
      else if(cmd==='inventory'||cmd==='inv'){ await send(`🎒 Bal $${bal} Fish ${get(`fish_${uid}`,0)} Pet ${get(`pet_${uid}`,'none')} LVL${lvl}`) }
      else if(cmd==='leaderboard'){ let keys=Object.keys(db).filter(k=>k.startsWith('money_')).sort((a,b)=>db[b]-db[a]).slice(0,5); let txt=keys.map((k,i)=>`${i+1}. ${k.slice(6,12)}: $${db[k]}`).join('\n'); await send(`🏆 Leaderboard\n${txt||'Empty'}`) }
    }catch(e){ console.log('ERROR',e) }
  })
}
start()
