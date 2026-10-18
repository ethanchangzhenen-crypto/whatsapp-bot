const { default: makeWASocket, useMultiFileAuthState } = require('@whiskeysockets/baileys')
const P = require('pino')
const fs = require('fs')
const express = require('express')
const QRCode = require('qrcode')

const app = express()
let currentQR = null
let isConnected = false
app.get('/', async (req, res) => {
  if (isConnected) return res.send('<h1>✅ BOT LINKED - Commands should work! Send !menu in WhatsApp</h1><style>body{font-family:Arial;text-align:center;padding:50px}</style>')
  if (currentQR) {
    let img = await QRCode.toDataURL(currentQR)
    return res.send(`<center><h1>SCAN TO LINK</h1><img src="${img}" style="width:350px;background:white;padding:20px"><script>setTimeout(()=>location.reload(),20000)</script></center>`)
  }
  res.send('Starting...<script>setTimeout(()=>location.reload(),3000)</script>')
})
app.listen(process.env.PORT || 3000, () => console.log('Web server'))

let db = {}; try{db=JSON.parse(fs.readFileSync('./database.json'))}catch{db={}}
function save(){fs.writeFileSync('./database.json',JSON.stringify(db,null,2))}
function get(k,d){return db[k]!==undefined?db[k]:d}
function set(k,v){db[k]=v;save()}
function add(k,v){db[k]=(db[k]||0)+v;save();return db[k]}

function makeBar(c,g){let p=Math.min(Math.floor(c/g*100),100);let f=Math.floor(p/10);return `[${"█".repeat(f)}${"░".repeat(10-f)}] ${p}%`;}
function getBoost(l){return 1+(l*0.15);}

async function startBot(){
  const { state, saveCreds } = await useMultiFileAuthState('./auth')
  const sock = makeWASocket({ auth: state, logger: P({level: 'silent'}) })
  sock.ev.on('creds.update', saveCreds)
  sock.ev.on('connection.update', u => {
    if(u.qr){ currentQR=u.qr; console.log('QR ready') }
    if(u.connection==='open'){ isConnected=true; currentQR=null; console.log('✅ CONNECTED') }
    if(u.connection==='close'){ isConnected=false; setTimeout(startBot,3000) }
  })

  sock.ev.on('messages.upsert', async m => {
    try{
      const msg = m.messages[0]
      if(!msg.message || msg.key.fromMe) return
      let txt = msg.message.conversation || msg.message.extendedTextMessage?.text || msg.message.imageMessage?.caption || ""
      if(!txt.startsWith('!')) return
      console.log('CMD:', txt)
      const from = msg.key.remoteJid
      const args = txt.slice(1).trim().split(/ +/)
      const cmd = args.shift().toLowerCase()
      const uid = msg.key.participant || from
      let bal = get(`money_${uid}`,1000)
      let lvl = get(`level_${uid}`,1)
      let exp = get(`exp_${uid}`,0)
      const send = async (t) => { await sock.sendMessage(from, {text:t}) }

      if(cmd==='menu'||cmd==='help'){
        await send(`💰 *ECONOMY RPG - FULL MENU*
Balance $${bal} | LVL ${lvl} ${getBoost(lvl).toFixed(1)}x

🎰 !cf heads/tails 100
🎰 !slots 100
🎲 !dice 3 100

🌾 !farm - +$250 + boost
🌱 !crops plant wheat
🐾 !pet / !pet feed / !pet play / !pet buy dog
🎣 !fish / !fish sell / !fish inv
👹 !hunt - +$ +EXP LVL1-10
🏠 !properties / !buy house
📈 !stocks / !stocks buy TSLA 1 / !stocks portfolio
🏁 !race
📱 !qr <text> - makes QR image
💵 !balance !daily !level !inventory !challenge`)
      }
      else if(cmd==='balance'||cmd==='bal'){ await send(`💵 $${bal} | LVL ${lvl} EXP ${exp}/1000 ${makeBar(exp,1000)}`) }
      else if(cmd==='level'){ await send(`LVL ${lvl} EXP ${exp}/1000 ${makeBar(exp,1000)} Boost ${getBoost(lvl)}x`) }
      else if(cmd==='challenge'){
        let today=['sunday','monday','tuesday','wednesday','thursday','friday','saturday'][new Date().getDay()]
        let prog=get(`challenge_${today}`,0)
        await send(`📅 ${today} challenge: ${prog} progress ${makeBar(prog,100)}`)
      }
      else if(cmd==='qr'){
        let link=args.join(' '); if(!link) return send('Use: !qr hello')
        let url=`https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(link)}`
        await sock.sendMessage(from, {image:{url:url}, caption:`📱 QR for ${link}`})
      }
      else if(cmd==='cf'){
        let choice=args[0]; let bet=parseInt(args[1])||100; if(bal<bet) return send(`No money $${bal}`)
        let result=Math.random()>0.5?'heads':'tails'
        if(choice===result){ let win=Math.floor(bet*getBoost(lvl)); add(`money_${uid}`,win); await send(`🪙 ${result} WIN +$${win}`) }
        else{ add(`money_${uid}`,-bet); await send(`🪙 ${result} LOSE -$${bet}`) }
      }
      else if(cmd==='slots'){
        let bet=parseInt(args[0])||100; if(bal<bet) return send(`No money`)
        let s=['🍒','🍋','💎','7️⃣']; let s1=s[Math.floor(Math.random()*4)],s2=s[Math.floor(Math.random()*4)],s3=s[Math.floor(Math.random()*4)]
        if(s1===s2&&s2===s3){ let win=bet*5; add(`money_${uid}`,win); await send(`🎰 [${s1}|${s2}|${s3}] JACKPOT +$${win}`) }
        else{ add(`money_${uid}`,-bet); await send(`🎰 [${s1}|${s2}|${s3}] LOSE -$${bet}`) }
      }
      else if(cmd==='dice'){
        let guess=parseInt(args[0]); let bet=parseInt(args[1])||100; let roll=Math.floor(Math.random()*6)+1
        if(guess===roll){ add(`money_${uid}`,bet*3); await send(`🎲 Rolled ${roll} WIN +$${bet*3}`) } else { add(`money_${uid}`,-bet); await send(`🎲 Rolled ${roll} LOSE`) }
      }
      else if(cmd==='farm'){ let e=Math.floor(250*getBoost(lvl)); add(`money_${uid}`,e); await send(`🌾 Farmed +$${e} Bal $${get(`money_${uid}`,0)}`) }
      else if(cmd==='crops'){ if(args[0]==='plant'){ set(`crop_${uid}`,Date.now()); await send(`🌱 Planted!`) } else await send(`🌱 Use !crops plant wheat`) }
      else if(cmd==='pet'){ if(args[0]==='feed'||args[0]==='play'){ await send(`🐶 Fed! 100%`) } else if(args[0]==='buy'){ set(`pet_${uid}`,args[1]||'dog'); await send(`🐾 Bought ${args[1]||'dog'}`) } else await send(`🐾 Pet: Use !pet feed / play / buy`) }
      else if(cmd==='fish'){ if(args[0]==='sell'){ let f=get(`fish_${uid}`,0); let v=f*50; set(`fish_${uid}`,0); add(`money_${uid}`,v); await send(`🎣 Sold ${f} fish $${v}`) } else if(args[0]==='inv'){ await send(`🎣 Fish: ${get(`fish_${uid}`,0)}`) } else { add(`fish_${uid}`,1); await send(`🎣 Caught! Total ${get(`fish_${uid}`,0)}`) } }
      else if(cmd==='hunt'){ let earn=Math.floor(150*getBoost(lvl)); add(`money_${uid}`,earn); add(`exp_${uid}`,50); let ne=get(`exp_${uid}`,0); if(ne>=1000&&lvl<10){ add(`level_${uid}`,1); set(`exp_${uid}`,0); await send(`👹 Killed! +$${earn} LEVEL UP LVL${lvl+1}!`) } else await send(`👹 Killed! +$${earn} EXP ${ne}/1000`) }
      else if(cmd==='properties'||cmd==='buy'){ if(cmd==='buy'){ let costs={house:10000,mansion:50000,hotel:100000}; let type=args[0]; if(!costs[type]) return send(`!buy house/mansion/hotel`); if(bal<costs[type]) return send(`Need $${costs[type]}`); add(`money_${uid}`,-costs[type]); add(`prop_${uid}_${type}`,1); await send(`🏠 Bought ${type}!`) } else await send(`🏠 House $10k Mansion $50k Hotel $100k !buy <type>`) }
      else if(cmd==='stocks'){ if(args[0]==='buy'){ let price={TSLA:200,AAPL:150,BTC:500}[args[1]]||200; let amt=parseInt(args[2])||1; let cost=price*amt; if(bal<cost) return send(`Need $${cost}`); add(`money_${uid}`,-cost); add(`stock_${uid}_${args[1]}`,amt); await send(`📈 Bought ${amt}x ${args[1]} $${cost}`) } else if(args[0]==='portfolio'){ await send(`📈 Portfolio TSLA:${get(`stock_${uid}_TSLA`,0)} AAPL:${get(`stock_${uid}_AAPL`,0)}`) } else await send(`📈 !stocks buy TSLA 1 | !stocks portfolio`) }
      else if(cmd==='race'){ await send(`🏁 Race finished!`) }
      else if(cmd==='daily'){ let last=get(`daily_${uid}`,0); if(Date.now()-last<86400000) return send(`⏰ Already claimed`); add(`money_${uid}`,1000); set(`daily_${uid}`,Date.now()); await send(`🎁 Daily +$1000`) }
      else if(cmd==='inventory'||cmd==='inv'){ await send(`🎒 Bal $${bal} Fish ${get(`fish_${uid}`,0)} Pet ${get(`pet_${uid}`,'none')} LVL ${lvl}`) }
      else{ await send(`Unknown !${cmd} - Try !menu`) }
    }catch(e){ console.log('CMD ERROR', e) }
  })
}
startBot()
