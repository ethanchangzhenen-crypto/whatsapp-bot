const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, Browsers } = require('@whiskeysockets/baileys')
const P = require('pino')
const express = require('express')
const app = express()
app.get('/', (req,res)=>res.send('GAMBLING BOT ONLINE ✅'))
app.listen(process.env.PORT||3000, ()=>console.log('web on'))

const CONFIG = {
    botName: "Gambling Bot",
    ownerNumber: "6597306863", // ONLY NUMBER, NO @...
    prefix: ".",
    startingMoney: 1000,
    dailyAmount: 500
}
const PROPERTIES = {
    house: 5000, hotel: 15000, casino: 50000, mansion: 100000, island: 500000
}

let db = {} // memory - fast, no slow file
function getUser(id){ if(!db[id]) db[id]={money:1000, props:[], lastDaily:0}; return db[id] }

async function startBot(){
    const { state, saveCreds } = await useMultiFileAuthState('auth')
    const sock = makeWASocket({ auth: state, logger: P({level:'silent'}), browser: Browsers.ubuntu('Chrome'), markOnlineOnConnect:false, syncFullHistory:false })
    sock.ev.on('creds.update', saveCreds)
    sock.ev.on('connection.update', (u)=>{ if(u.connection==='open') console.log('GAMBLING READY') })

    sock.ev.on('messages.upsert', async (m)=>{
        const msg=m.messages[0]
        if(!msg.message || msg.key.fromMe) return
        let text = msg.message.conversation || msg.message.extendedTextMessage?.text || msg.message.imageMessage?.caption || ""
        if(!text) return
        const jid=msg.key.remoteJid
        const sender=isGroup=> jid.endsWith('@g.us') ? msg.key.participant : jid
        const senderId = jid.endsWith('@g.us') ? msg.key.participant : jid

        if(!text.startsWith(CONFIG.prefix)) return
        const parts=text.slice(1).trim().split(/ +/)
        const cmd=parts[0].toLowerCase()
        const args=parts.slice(1)
        const user=getUser(senderId)

        // INSTANT REPLY - no await file
        if(cmd==='bal' || cmd==='balance'){
            await sock.sendMessage(jid, {text:`💰 Balance: $${user.money}\nProps: ${user.props.join(', ')||'None'}`})
        }
        else if(cmd==='menu'){
            await sock.sendMessage(jid, {text:`*GAMBLING MENU*\n\n.bal - balance\n.slots 100 - play slots\n.daily - $${CONFIG.dailyAmount} daily\n.shop - see properties\n.buy house - buy\n.top - leaderboard\n\nADMIN:\n.give @user 1000\n.reset @user`})
        }
        else if(cmd==='daily'){
            const now=Date.now()
            if(now-user.lastDaily < 86400000) return sock.sendMessage(jid, {text:`⏳ Already claimed, wait ${Math.ceil((86400000-(now-user.lastDaily))/3600000)}h`})
            user.lastDaily=now; user.money+=CONFIG.dailyAmount
            await sock.sendMessage(jid, {text:`✅ +$${CONFIG.dailyAmount}! Balance: $${user.money}`})
        }
        else if(cmd==='slots' || cmd==='slot'){
            const bet=parseInt(args[0])||100
            if(user.money < bet) return sock.sendMessage(jid, {text:`❌ Need $${bet}, you have $${user.money}`})
            const s=['🍒','🍋','💎','7️⃣','🍀','🍊']
            const r=[s[Math.floor(Math.random()*6)], s[Math.floor(Math.random()*6)]]
            let win=0
            if(r[0]===r[1] && r[1]===r[2]) win = r[0]==='💎'||r[0]==='7️⃣' ? bet*10 : bet*5
            else if(r[0]===r[1] || r[1]===r[2] || r[0]===r[2]) win=bet*2
            if(win>0){ user.money+=win; await sock.sendMessage(jid, {text:`🎰 [${r.join(' | ')}]\n🎉 WIN $${win}! Bal: $${user.money}`}) }
            else { user.money-=bet; await sock.sendMessage(jid, {text:`🎰 [${r.join(' | ')}]\n💸 LOSE $${bet} Bal: $${user.money}`}) }
        }
        else if(cmd==='shop'){
            let t=`🏪 SHOP\n\n`
            for(let k in PROPERTIES) t+=`${k} - $${PROPERTIES[k]}\n`
            t+=`\nBuy: .buy house`
            await sock.sendMessage(jid, {text:t})
        }
        else if(cmd==='buy'){
            const prop=(args[0]||'').toLowerCase()
            if(!PROPERTIES[prop]) return sock.sendMessage(jid, {text:`❌ Use .shop`})
            if(user.money < PROPERTIES[prop]) return sock.sendMessage(jid, {text:`❌ Need $${PROPERTIES[prop]}`})
            user.money-=PROPERTIES[prop]; user.props.push(prop)
            await sock.sendMessage(jid, {text:`✅ Bought ${prop}! Bal: $${user.money}`})
        }
        else if(cmd==='give'){
            const isOwner = senderId.includes(CONFIG.ownerNumber)
            if(!isOwner) return sock.sendMessage(jid, {text:`❌ Admin only`})
            const target = msg.message.extendedTextMessage?.contextInfo?.mentionedJid?.[0]
            const amount=parseInt(args[1]||args[0])||0
            if(!target || !amount) return sock.sendMessage(jid, {text:`Use: .give @user 1000`})
            const t=getUser(target); t.money+=amount
            await sock.sendMessage(jid, {text:`✅ Gave $${amount} to @${target.split('@')[0]}`, mentions:[target]})
        }
        else if(cmd==='reset'){
            const isOwner = senderId.includes(CONFIG.ownerNumber)
            if(!isOwner) return
            const target = msg.message.extendedTextMessage?.contextInfo?.mentionedJid?.[0]
            if(!target) return sock.sendMessage(jid, {text:`Use: .reset @user`})
            db[target]={money:CONFIG.startingMoney, props:[], lastDaily:0}
            await sock.sendMessage(jid, {text:`🔄 Reset @${target.split('@')[0]}`, mentions:[target]})
        }
    })
}
startBot()
