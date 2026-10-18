const { default: makeWASocket, useMultiFileAuthState } = require('@whiskeysockets/baileys')
const P = require('pino')
const fs = require('fs')
const express = require('express')
const QRCode = require('qrcode')

const app = express()
let qrCode = null
let connected = false
app.get('/', async (req,res)=>{
  if(connected) return res.send('<h1>✅ BOT - CROPS SYSTEM ACTIVE</h1>')
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
function isAdmin(uid, from){ let a=get(`admins_${from}`,[]); let g=get(`global_admins`,[]); if(g.length===0) return true; return a.includes(uid)||g.includes(uid) }
function isBotEnabled(from){ return get(`bot_enabled_${from}`, true) }

// CROPS CONFIG
const cropTypes = {
  wheat: { time: 60, price: 500, emoji: "🌾" },
  corn: { time: 120, price: 1000, emoji: "🌽" },
  carrot: { time: 180, price: 1500, emoji: "🥕" },
  tomato: { time: 300, price: 3000, emoji: "🍅" },
  goldencrop: { time: 600, price: 10000, emoji: "🌟" }
}

const cooldowns = { farm:0, harvest:60, fish:15, hunt:30, slots:5, cf:5, dice:5, race:20, pet:10, daily:86400, plant:5 }
let userCooldowns = {}
function checkCooldown(uid, cmd){
  let key = `${uid}_${cmd}`; let now = Date.now()/1000
  if(userCooldowns[key] && userCooldowns[key] > now){ return Math.ceil(userCooldowns[key]-now) }
  return 0
}
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

      // ADMIN
      if(cmd==='resetadmin'){ let g=get(`global_admins`,[]); if(args[0]==='force'||g.length===0||g.includes(uid)){ set(`global_admins`,[]); set(`admins_${from}`,[]); set(`banned_${from}`,[]); set(`bot_enabled_${from}`,true); return send(`♻️ RESET DONE! Send !admin`) } else return send(`❌ Main admin only - !resetadmin force`) }
      if(cmd==='off'){ if(!isAdmin(uid,from)) return send(`❌ Admin only`); set(`bot_enabled_${from}`,false); return send(`🔴 BOT OFF`) }
      if(cmd==='on'){ if(!isAdmin(uid,from)) return send(`❌ Admin only`); set(`bot_enabled_${from}`,true); return send(`🟢 BOT ON`) }
      if(cmd==='admin'){
        if(args[0]==='reset'){ set(`global_admins`,[]); set(`admins_${from}`,[]); return send(`♻️ Reset!`) }
        if(args[0]==='add'){ let m=msg.message.extendedTextMessage?.contextInfo?.mentionedJid?.[0]||args[1]; let admins=get(`admins_${from}`,[]); if(!admins.includes(m)){admins.push(m); set(`admins_${from}`,admins)} let g=get(`global_admins`,[]); if(!g.includes(m)){g.push(m); set(`global_admins`,g)} return send(`✅ Added ${m}`) }
        if(args[0]==='list'){ let a=get(`admins_${from}`,[]); let g=get(`global_admins`,[]); return send(`👑 Group:${a.join(',')||'None'}\nGlobal:${g.join(',')||'None'}`) }
        let g=get(`global_admins`,[]); if(g.length===0){ set(`global_admins`,[uid]); set(`admins_${from}`,[uid]); return send(`👑 You are MAIN ADMIN!`) }
        return send(`👑 !on !off !admin add @user !resetadmin`)
      }

      if(!isBotEnabled(from) && cmd!=='on' && cmd!=='admin') return

      // ===== NEW FARM SYSTEM =====
      if(cmd==='farm'){
        // Show all crops user have
        let crops = get(`crops_${uid}`, {}) // {wheat: {plantedAt: timestamp, count:1}, ...}
        let txt = `🌾 *YOUR FARM* Bal $${bal}\n\n`
        let hasAny = false
        for(let type in cropTypes){
          let data = crops[type]
          if(data && data.count>0){
            hasAny = true
            let cfg = cropTypes[type]
            let planted = data.plantedAt
            let elapsed = (Date.now() - planted)/1000
            let ready = elapsed >= cfg.time
            if(ready){
              txt += `${cfg.emoji} ${type.toUpperCase()} x${data.count} - ✅ READY! Use !harvest ${type}\n`
            } else {
              let left = Math.ceil(cfg.time - elapsed)
              txt += `${cfg.emoji} ${type.toUpperCase()} x${data.count} - ⏳ ${left}s left\n`
            }
          }
        }
        if(!hasAny) txt += `No crops planted!\n\n`
        txt += `\n🌱 *PLANT:* !plant wheat/corn/carrot/tomato/goldencrop\n`
        txt += `🌾 *HARVEST:* !harvest <crop> (60s cooldown)\n\n`
        txt += `📊 Crop Prices:\n`
        for(let t in cropTypes){ txt += `${cropTypes[t].emoji} ${t} - $${cropTypes[t].price} - Grow ${cropTypes[t].time}s\n` }
        await send(txt)
      }
      else if(cmd==='plant'){
        let left = checkCooldown(uid, 'plant'); if(left>0) return send(`⏳ Plant cooldown ${left}s`)
        let type = args[0]?.toLowerCase()
        if(!type || !cropTypes[type]) return send(`🌱 Use: !plant wheat\nAvailable: wheat, corn, carrot, tomato, goldencrop\n\nExample: !plant wheat`)
        let crops = get(`crops_${uid}`, {})
        // If already have this crop growing, add count
        if(crops[type]){
          // If still growing, don't allow replant same type until harvested
          let cfg = cropTypes[type]
          let elapsed = (Date.now() - crops[type].plantedAt)/1000
          if(elapsed < cfg.time){
            return send(`⏳ ${type} still growing! ${Math.ceil(cfg.time-elapsed)}s left\nUse !farm to check`)
          }
          // Ready but not harvested, need harvest first
          return send(`✅ ${type} is READY! Use !harvest ${type} first before planting again`)
        }
        crops[type] = { plantedAt: Date.now(), count: 1 }
        set(`crops_${uid}`, crops)
        setCooldown(uid, 'plant')
        await send(`${cropTypes[type].emoji} Planted ${type.toUpperCase()}!\n⏳ Grow time: ${cropTypes[type].time}s\nUse !farm to check progress\nThen !harvest ${type}`)
      }
      else if(cmd==='harvest' || cmd==='hervest'){ // accept both spellings
        let left = checkCooldown(uid, 'harvest')
        if(left>0) return send(`⏳ Harvest cooldown! Wait ${left}s\nHarvest cooldown is 60s`)
        let type = args[0]?.toLowerCase()
        if(!type) return send(`🌾 Use: !harvest <crop>\nExample: !harvest wheat\n\n!farm to see your crops`)
        if(!cropTypes[type]) return send(`❌ Unknown crop ${type}\nAvailable: wheat, corn, carrot, tomato, goldencrop`)
        let crops = get(`crops_${uid}`, {})
        if(!crops[type] || crops[type].count===0) return send(`❌ You don't have ${type} planted!\nUse !plant ${type}`)
        let cfg = cropTypes[type]
        let elapsed = (Date.now() - crops[type].plantedAt)/1000
        if(elapsed < cfg.time){
          let need = Math.ceil(cfg.time - elapsed)
          return send(`⏳ ${cfg.emoji} ${type} not ready yet!\nWait ${need}s more\nGrow time: ${cfg.time}s`)
        }
        // HARVEST SUCCESS
        let count = crops[type].count
        let earn = Math.floor(cfg.price * count * getBoost(lvl))
        let nb = add(`money_${uid}`, earn)
        delete crops[type]
        set(`crops_${uid}`, crops)
        add(`challenge_${today}`, earn)
        setCooldown(uid, 'harvest')
        await send(`${cfg.emoji} HARVESTED ${type.toUpperCase()} x${count}!\n+ $${earn} (Boost ${getBoost(lvl).toFixed(1)}x)\n💰 New Balance: $${nb}\n⏳ Next harvest in 60s\n\nUse !plant ${type} to plant again`)
      }
      else if(cmd==='menu'){
        await send(`💰 *MENU - CROPS UPDATE*
Bal $${bal} LVL${lvl}

🌾 FARM NEW:
!farm - Show your crops
!plant wheat - Plant crop
!harvest wheat - Harvest ready crop (60s cd)

🌱 Crops: wheat(60s $500) corn(120s $1000) carrot(180s $1500) tomato(300s $3000) goldencrop(600s $10000)

🎰 !slots 100 (5s)
🎰 !cf heads 100 (5s)
👹 !hunt (30s)
🎣 !fish (15s)
👑 !admin !on !off`)
      }
      else if(cmd==='balance'||cmd==='bal'){ await send(`💵 Balance: $${bal} LVL${lvl}`) }
      else if(cmd==='slots'){
        let left=checkCooldown(uid,'slots'); if(left>0) return send(`⏳ Wait ${left}s`)
        let bet=parseInt(args[0])||100; if(bal<bet) return send(`Need $${bet} have $${bal}`)
        let s=['🍒','🍋','💎','7️⃣']; let a=s[Math.floor(Math.random()*4)],b=s[Math.floor(Math.random()*4)],c=s[Math.floor(Math.random()*4)]
        if(a===b&&b===c){ let nb=add(`money_${uid}`,bet*5); setCooldown(uid,'slots'); await send(`🎰 [${a}|${b}|${c}] JACKPOT +$${bet*5}\n💰 New Bal: $${nb}`) }
        else{ let nb=add(`money_${uid}`,-bet); setCooldown(uid,'slots'); await send(`🎰 [${a}|${b}|${c}] LOSE -$${bet}\n💰 New Bal: $${nb}`) }
      }
      else if(cmd==='cf'){
        let left=checkCooldown(uid,'cf'); if(left>0) return send(`⏳ Wait ${left}s`)
        let bet=parseInt(args[1])||100; if(bal<bet) return send(`Need $${bet}`)
        let res=Math.random()>0.5?'heads':'tails'
        if(args[0]===res){ let nb=add(`money_${uid}`,bet); setCooldown(uid,'cf'); await send(`🪙 ${res.toUpperCase()} WIN +$${bet}\n💰 New Bal: $${nb}`) }
        else{ let nb=add(`money_${uid}`,-bet); setCooldown(uid,'cf'); await send(`🪙 ${res.toUpperCase()} LOSE -$${bet}\n💰 New Bal: $${nb}`) }
      }
      else if(cmd==='fish'){
        if(args[0]==='sell'){ let f=get(`fish_${uid}`,0); if(f==0) return send(`No fish`); let nb=add(`money_${uid}`,f*50); set(`fish_${uid}`,0); await send(`🎣 Sold ${f} +$${f*50} New Bal $${nb}`) }
        else{ let left=checkCooldown(uid,'fish'); if(left>0) return send(`⏳ Fish ${left}s`); add(`fish_${uid}`,1); setCooldown(uid,'fish'); await send(`🎣 Caught! Total ${get(`fish_${uid}`,0)}`) }
      }
      else if(cmd==='hunt'){
        let left=checkCooldown(uid,'hunt'); if(left>0) return send(`⏳ Hunt ${left}s`)
        let earn=Math.floor(150*getBoost(lvl)); let nb=add(`money_${uid}`,earn); add(`exp_${uid}`,50); setCooldown(uid,'hunt'); await send(`👹 +$${earn} New Bal $${nb}`)
      }
      else if(cmd==='daily'){ let last=get(`daily_${uid}`,0); if(Date.now()-last<86400000) return send(`⏰ Already claimed`); let nb=add(`money_${uid}`,1000); set(`daily_${uid}`,Date.now()); await send(`🎁 +$1000 New Bal $${nb}`) }
      else if(cmd==='qr'){ let link=args.join(' '); let url=`https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(link)}`; await sock.sendMessage(from, {image:{url:url}, caption:`📱 QR: ${link}`}, {quoted:msg}) }
    }catch(e){ console.log('ERROR',e) }
  })
}
start()
