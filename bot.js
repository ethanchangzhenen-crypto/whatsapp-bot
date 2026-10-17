const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, Browsers } = require('@whiskeysockets/baileys')
const P = require('pino')
const express = require('express')
const app = express()
app.get('/', (req,res)=>{ if(!latestQR) return res.send('BOT ONLINE - IF YOU SEE THIS AND NO QR, BOT IS READY'); res.send(`<h1>SCAN QR</h1><img src="${latestQR}" style="width:350px"><script>setTimeout(()=>location.reload(),20000),20000</script>`) })
app.listen(process.env.PORT||3000)
let latestQR=''

const CONFIG={ ownerNumber:"6597306863", prefix:".", startingMoney:1000 }
const PROPERTIES={ house:5000, hotel:15000, casino:50000, mansion:100000, island:500000 }
let db={}
function getUser(id){ if(!db[id]) db[id]={money:1000, props:[], lastDaily:0}; return db[id] }

async function startBot(){
    const { state, saveCreds } = await useMultiFileAuthState('auth')
    const sock = makeWASocket({ 
        auth: state, 
        logger: P({level:'silent'}), 
        browser: Browsers.ubuntu('Chrome'),
        markOnlineOnConnect:false,
        getMessage: async ()=>undefined
    })
    sock.ev.on('creds.update', saveCreds)
    sock.ev.on('connection.update', async (u)=>{
        const {connection, lastDisconnect, qr} = u
        if(qr){ latestQR = await require('qrcode').toDataURL(qr); console.log('QR READY - OPEN WEBPAGE') }
        if(connection==='close'){
            const code=lastDisconnect?.error?.output?.statusCode
            console.log('Closed, code:', code)
            if(code!==DisconnectReason.loggedOut) startBot()
        } else if(connection==='open'){ latestQR=''; console.log('GAMBLING BOT READY - NO BAD MAC') }
    })

    // IGNORE BAD MAC ERRORS
    sock.ev.on('creds.update', saveCreds)
    
    sock.ev.on('messages.upsert', async (m)=>{
        try{
            const msg=m.messages[0]
            if(!msg.message || msg.key.fromMe) return
            let text=msg.message.conversation || msg.message.extendedTextMessage?.text || ""
            if(!text.startsWith(CONFIG.prefix)) return
            const jid=msg.key.remoteJid
            const senderId=jid.endsWith('@g.us') ? msg.key.participant : jid
            const parts=text.slice(1).trim().split(/ +/)
            const cmd=parts[0].toLowerCase()
            const args=parts.slice(1)
            const user=getUser(senderId)

            if(cmd==='bal' || cmd==='menu' || cmd==='shop' || cmd==='slots' || cmd==='buy' || cmd==='give' || cmd==='reset' || cmd==='daily'){
                // your gambling logic here - same as before
                if(cmd==='bal') await sock.sendMessage(jid, {text:`💰 Balance: $${user.money}\nProps: ${user.props.join(', ')||'None'}`})
                if(cmd==='menu') await sock.sendMessage(jid, {text:`*MENU*\n.bal\n.slots 100\n.daily\n.shop\n.buy house\n.give @user 1000\n.reset @user`})
                if(cmd==='daily'){ 
                    const now=Date.now()
                    if(now-user.lastDaily < 86400000) return sock.sendMessage(jid, {text:`Wait ${Math.ceil((86400000-(now-user.lastDaily))/3600000)}h`})
                    user.lastDaily=now; user.money+=500; await sock.sendMessage(jid, {text:`✅ +$500! Bal: $${user.money}`})
                }
                if(cmd==='slots'){
                    const bet=parseInt(args[0])||100
                    if(user.money<bet) return sock.sendMessage(jid, {text:`Need $${bet}`})
                    const s=['🍒','💎','7️⃣']; const r=[s[Math.floor(Math.random()*3)], s[Math.floor(Math.random()*3)]]
                    if(r[0]===r[1] && r[1]===r[2]){ user.money+=bet*5; await sock.sendMessage(jid, {text:`🎰 ${r.join('|')} WIN $${bet*5}! Bal $${user.money}`}) }
                    else { user.money-=bet; await sock.sendMessage(jid, {text:`🎰 ${r.join('|')} LOSE $${bet} Bal $${user.money}`}) }
                }
                if(cmd==='shop'){ let t=`SHOP\n`; for(let k in PROPERTIES) t+=`${k} - $${PROPERTIES[k]}\n`; await sock.sendMessage(jid, {text:t}) }
                if(cmd==='buy'){ const p=(args[0]||'').toLowerCase(); if(!PROPERTIES[p]) return; if(user.money<PROPERTIES[p]) return sock.sendMessage(jid, {text:`Need $${PROPERTIES[p]}`}); user.money-=PROPERTIES[p]; user.props.push(p); await sock.sendMessage(jid, {text:`Bought ${p}! Bal $${user.money}`}) }
                if(cmd==='give'){ if(!senderId.includes(CONFIG.ownerNumber)) return; const target=msg.message.extendedTextMessage?.contextInfo?.mentionedJid?.[0]; const amt=parseInt(args[1])||0; if(!target||!amt) return; getUser(target).money+=amt; await sock.sendMessage(jid, {text:`Gave $${amt}`, mentions:[target]}) }
                if(cmd==='reset'){ if(!senderId.includes(CONFIG.ownerNumber)) return; const target=msg.message.extendedTextMessage?.contextInfo?.mentionedJid?.[0]; if(!target) return; db[target]={money:1000, props:[], lastDaily:0}; await sock.sendMessage(jid, {text:`Reset`, mentions:[target]}) }
            }
        }catch(e){ console.log('Msg error ignored:', e.message) }
    })
}
startBot()
