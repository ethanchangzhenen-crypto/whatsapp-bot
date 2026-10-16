const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys')
const express = require('express')
const fs = require('fs')
const app = express()
let page = '<h1>Starting Pairing Code Bot...</h1>'
app.get('/', (req,res)=> res.send(page))
app.listen(process.env.PORT||3000)

let db = {}
if(fs.existsSync('./database.json')){ try{ db = JSON.parse(fs.readFileSync('./database.json')) }catch{} }
function saveDB(){ fs.writeFileSync('./database.json', JSON.stringify(db)) }
function getUser(id){ if(!db[id]) db[id] = { money: 1000, daily: 0, props: [], invested: 0, lastInvest: 0 }; return db[id] }

async function start(){
  const {version} = await fetchLatestBaileysVersion()
  const {state, saveCreds} = await useMultiFileAuthState('./auth_info')
  const sock = makeWASocket({version, auth: state, printQRInTerminal: false, browser: ["Ubuntu","Chrome","110"]})
  sock.ev.on('creds.update', saveCreds)

  sock.ev.on('connection.update', async (u)=>{
    if(u.connection==='open'){
      page = '<h1 style="color:green;text-align:center;font-size:40px">✅ SELF-BOT ONLINE!<br>YOU ARE THE BOT!<br>Test!balance in General group</h1>'
      console.log('ONLINE!')
    }
  })

  // REQUEST PAIRING CODE
  if(!state.creds.registered){
    setTimeout(async ()=>{
      try{
        const code = await sock.requestPairingCode("6597306863")
        page = `<div style="text-align:center;font-family:Arial"><h1>YOUR PAIRING CODE</h1><h1 style="font-size:60px;letter-spacing:10px;background:black;color:white;padding:20px">${code}</h1><h2>Go WhatsApp > Linked Devices > Link Device > Link with phone number > Enter this code</h2><p>Code expires in 1 min, page auto reloads</p></div><script>setTimeout(()=>location.reload(),60000)</script>`
        console.log('PAIRING CODE:', code)
      }catch(e){ console.log('Pairing error', e); page = '<h1>Error getting code, check logs</h1>' }
    }, 3000)
  }

  sock.ev.on('messages.upsert', async ({messages})=>{
    const m = messages[0]
    if(!m.message) return
    const raw = (m.message.conversation || m.message.extendedTextMessage?.text || '').trim()
    if(!raw) return
    if(raw.includes('BALANCE:') || raw.includes('MONEY BOT MENU') || raw.includes('SELF-BOT ONLINE')) return
    if(!raw.startsWith('!') && raw.toLowerCase()!=='hi' && raw.toLowerCase()!=='hello') return

    const text = raw.toLowerCase()
    const chatId = m.key.remoteJid
    const sender = m.key.participant || chatId
    console.log('COMMAND:', raw)
    const user = getUser(sender)

    if(text==='!help' || text==='!menu'){
      await sock.sendMessage(chatId, {text:`💰 *YOU ARE THE BOT! SELF-BOT MENU* 💰\n\n!balance - Your money\n!daily - Free $1000 daily\n!work - Earn $100-500\n!slots 100 - Slots gamble\n!buy house - Buy $5000 house\n!properties - Shop\n!invest 1000 - 20% profit\n!collect - Collect\n\nType!balance`})
    }
    else if(text==='!balance' || text==='!bal'){
      await sock.sendMessage(chatId, {text:`💰 BALANCE: $${user.money}\n🏠 Props: ${user.props.length} | 📈 Invested: $${user.invested}`})
    }
    else if(text==='!daily'){
      const now=Date.now()
      if(now-user.daily<86400000){ await sock.sendMessage(chatId, {text:`⏳ Already claimed! Wait ${Math.ceil((86400000-(now-user.daily))/3600000)}h`}) }
      else { user.money+=1000; user.daily=now; saveDB(); await sock.sendMessage(chatId, {text:`✅ DAILY +$1000! Balance: $${user.money}`}) }
    }
    else if(text==='!work'){ const e=Math.floor(Math.random()*400)+100; user.money+=e; saveDB(); await sock.sendMessage(chatId, {text:`💼 Work +$${e} = $${user.money}`}) }
    else if(text.startsWith('!slots ')){
      const amt=parseInt(text.split(' ')[1]); if(!amt||user.money<amt){ await sock.sendMessage(chatId, {text:`❌ Need $${amt} have $${user.money}`}); return }
      const s=['🍒','🍋','💎','7️⃣','🍀']; const r1=s[Math.floor(Math.random()*5)], r2=s[Math.floor(Math.random()*5)], r3=s[Math.floor(Math.random()*5)]
      if(r1===r2&&r2===r3){ const w=amt*5; user.money+=w; saveDB(); await sock.sendMessage(chatId, {text:`🎰 [${r1}|${r2}|${r3}] JACKPOT +$${w}! = $${user.money}`}) }
      else if(r1===r2||r2===r3||r1===r3){ const w=amt*2; user.money+=w; saveDB(); await sock.sendMessage(chatId, {text:`🎰 [${r1}|${r2}|${r3}] WIN +$${w}! = $${user.money}`}) }
      else { user.money-=amt; saveDB(); await sock.sendMessage(chatId, {text:`🎰 [${r1}|${r2}|${r3}] LOST $${amt}. Bal: $${user.money}`}) }
    }
    else if(text==='!properties'){ await sock.sendMessage(chatId, {text:`🏠 SHOP:\n house $5k\n shop $15k\n hotel $50k\n mall $200k\n\n!buy house`}) }
    else if(text.startsWith('!buy ')){ const p=text.split(' ')[1]; const prices={house:5000,shop:15000,hotel:50000,mall:200000}; if(!prices[p]) return; if(user.money<prices[p]){ await sock.sendMessage(chatId, {text:`❌ Need $${prices[p]}`}); return } user.money-=prices[p]; user.props.push(p); saveDB(); await sock.sendMessage(chatId, {text:`✅ Bought ${p}! Bal: $${user.money}`}) }
    else if(text==='hi'||text==='hello'){ await sock.sendMessage(chatId, {text:'👋 Self-Bot Online! I am YOU! Type!help 💰'}) }
  })
}
start()
