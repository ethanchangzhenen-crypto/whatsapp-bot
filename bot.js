const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, Browsers } = require('@whiskeysockets/baileys')
const express = require('express')
const app = express()
let html = 'Loading...'
app.get('/', (req,res)=>res.send(html))
app.listen(process.env.PORT||3000, ()=>console.log('Web OK'))

async function start(){
  const {version} = await fetchLatestBaileysVersion()
  const {state, saveCreds} = await useMultiFileAuthState('./auth_info')
  const sock = makeWASocket({
    version,
    auth: state,
    browser: Browsers.ubuntu('Chrome'),
    printQRInTerminal: false,
    syncFullHistory: false
  })
  sock.ev.on('creds.update', saveCreds)

  sock.ev.on('connection.update', (u)=>{
    console.log('CONNECTION UPDATE:', u)
    if(u.connection==='open'){
      html = '<h1 style="text-align:center;color:green;font-size:50px">✅ ONLINE! YOU ARE THE BOT!<br>Go test!balance</h1>'
      console.log('CONNECTED!')
    }
    if(u.connection==='close'){
      html = '<h1>Connection closed, restarting... wait 20 sec and reload</h1>'
      console.log('Closed, restarting in 10s')
      setTimeout(start, 10000)
    }
  })

  if(!state.creds.registered){
    console.log('Not registered, waiting 5 sec for pairing...')
    await new Promise(r=>setTimeout(r,5000))
    try{
      const code = await sock.requestPairingCode("6597306863")
      console.log('CODE GENERATED:', code)
      html = `
      <div style="text-align:center;font-family:Arial;padding:20px">
        <h1>🔥 YOUR PAIRING CODE 🔥</h1>
        <h1 style="font-size:70px;letter-spacing:15px;background:#000;color:#fff;padding:30px;border-radius:20px">${code}</h1>
        <h2>1. Open WhatsApp on 97306863</h2>
        <h2>2. Settings > Linked Devices > Link a device</h2>
        <h2>3. At bottom click "Link with phone number instead"</h2>
        <h2>4. Type this code: ${code}</h2>
        <p style="color:red">Code expires in 60 seconds! Reload page if expired!</p>
      </div>
      <script>setTimeout(()=>location.reload(), 55000)</script>
      `
    }catch(e){
      console.log('Pairing Error:', e)
      html = `<h1>Error: ${e.message}<br>Wait 2 min then RELOAD this page<br><br>Make sure you deleted auth_info volume!</h1><pre>${JSON.stringify(e,null,2)}</pre>`
    }
  }

  // === SELF BOT ===
  let db={}; const fs=require('fs')
  try{if(fs.existsSync('./database.json')) db=JSON.parse(fs.readFileSync('./database.json'))}catch{}
  const save=()=>fs.writeFileSync('./database.json', JSON.stringify(db))
  const getU=(id)=>{ if(!db[id]) db[id]={money:1000}; return db[id] }

  sock.ev.on('messages.upsert', async ({messages})=>{
    const m=messages[0]; if(!m.message) return
    const raw=(m.message.conversation||m.message.extendedTextMessage?.text||'').trim()
    if(!raw || raw.includes('BALANCE:') || raw.includes('PAIRING CODE') || raw.includes('ONLINE!')) return
    const lower=raw.toLowerCase(); if(!lower.startsWith('!') && lower!=='hi') return
    console.log('CMD:', raw)
    const chat=m.key.remoteJid
    if(lower==='!balance'){ const u=getU(m.key.participant||chat); await sock.sendMessage(chat,{text:`💰 BALANCE: $${u.money} - YOU ARE THE BOT!`}) }
    if(lower==='!help'){ await sock.sendMessage(chat,{text:`!balance!daily!work!slots 100\nYOU ARE THE BOT! Everyone sees you reply!`}) }
    if(lower==='hi'){ await sock.sendMessage(chat,{text:'👋 Im online! I am YOU! Type!balance'}) }
  })
}
start()
