const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, Browsers } = require('@whiskeysockets/baileys')
const P = require('pino')
const express = require('express')
const fs = require('fs')
const app = express()

// ============= CONFIG - EDIT HERE =============
const CONFIG = {
    botName: "Gambling Bot",
    ownerNumber: "6597306863@s.whatsapp.net", // YOUR NUMBER - admin
    prefix: ".",
    startingMoney: 1000,
    dailyAmount: 500
}
const PROPERTIES = {
    house: { price: 5000, rent: 200 },
    hotel: { price: 15000, rent: 800 },
    casino: { price: 50000, rent: 3000 },
    mansion: { price: 100000, rent: 7000 },
    island: { price: 500000, rent: 40000 }
}
// ==============================================

let latestQR = ''
const PORT = process.env.PORT || 3000
app.get('/', (req,res)=>{
    if(!latestQR) return res.send(`<h1>${CONFIG.botName} READY ✅</h1><p>Slots, Properties, Money - Online 24/7</p>`)
    res.send(`<h1>Scan QR</h1><img src="${latestQR}" style="width:350px"><script>setTimeout(()=>location.reload(),20000),20000</script>`)
})
app.listen(PORT, ()=>console.log('Web',PORT))

// DATABASE
const DB_FILE = './auth/database.json'
function loadDB(){ try{ if(fs.existsSync(DB_FILE)) return JSON.parse(fs.readFileSync(DB_FILE)) }catch(e){} return {} }
function saveDB(db){ try{ fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2)) }catch(e){console.log(e)} }
let db = loadDB()

function getUser(jid){
    if(!db[jid]) db[jid] = { money: CONFIG.startingMoney, properties: [], lastDaily: 0, lastWork: 0 }
    if(!db[jid].properties) db[jid].properties = []
    return db[jid]
}
function isAdmin(sender){ return sender === CONFIG.ownerNumber || sender.includes(CONFIG.ownerNumber.replace('@s.whatsapp.net','')) }

async function startBot(){
    const { state, saveCreds } = await useMultiFileAuthState('auth')
    const sock = makeWASocket({ auth: state, logger: P({level:'silent'}), browser: Browsers.ubuntu('Chrome') })
    sock.ev.on('creds.update', saveCreds)
    sock.ev.on('connection.update', async (u)=>{
        const {connection, lastDisconnect, qr} = u
        if(qr){ latestQR = await require('qrcode').toDataURL(qr) }
        if(connection === 'close'){
            const code = lastDisconnect?.error?.output?.statusCode
            if(code !== DisconnectReason.loggedOut) startBot()
        } else if(connection === 'open'){ latestQR=''; console.log('GAMBLING BOT READY') }
    })

    sock.ev.on('messages.upsert', async (m)=>{
        try{
            const msg = m.messages[0]
            if(!msg.message || msg.key.fromMe) return
            if(msg.key.remoteJid === 'status@broadcast') return
            const type = Object.keys(msg.message)[0]
            let text = ''
            if(type==='conversation') text=msg.message.conversation
            else if(type==='extendedTextMessage') text=msg.message.extendedTextMessage.text
            else if(type==='imageMessage') text=msg.message.imageMessage.caption||''
            else if(type==='videoMessage') text=msg.message.videoMessage.caption||''
            if(!text) return
            const jid = msg.key.remoteJid
            const isGroup = jid.endsWith('@g.us')
            const sender = isGroup ? msg.key.participant : jid
            const senderJid = sender
            if(!text.startsWith(CONFIG.prefix)) return
            const args = text.slice(1).trim().split(/ +/)
            const cmd = args.shift().toLowerCase()
            const user = getUser(senderJid)

            // SAVE HELPER
            const save = ()=>saveDB(db)

            // ==== PLAYER COMMANDS ====
            if(cmd==='balance' || cmd==='bal' || cmd==='money'){
                await sock.sendMessage(jid, {text: `💰 *BALANCE*\n\nMoney: $${user.money}\nProperties: ${user.properties.length}\n${user.properties.map(p=>`• ${p}`).join('\n')||'None'}`})
            }
            else if(cmd==='daily'){
                const now = Date.now()
                if(now - user.lastDaily < 86400000){
                    const left = Math.ceil((86400000 - (now-user.lastDaily))/3600000)
                    return sock.sendMessage(jid, {text: `⏳ Daily already claimed! Come back in ${left}h`})
                }
                user.money += CONFIG.dailyAmount
                user.lastDaily = now; save()
                await sock.sendMessage(jid, {text: `✅ Daily claimed! +$${CONFIG.dailyAmount}\nNew balance: $${user.money}`})
            }
            else if(cmd==='work'){
                const now = Date.now()
                if(now - user.lastWork < 3600000) return sock.sendMessage(jid, {text: `⏳ Work cooldown! Wait 1 hour`})
                const earned = Math.floor(Math.random()*300)+100
                user.money += earned; user.lastWork = now; save()
                await sock.sendMessage(jid, {text: `💼 You worked and earned $${earned}!\nBalance: $${user.money}`})
            }
            else if(cmd==='slots' || cmd==='slot' || cmd==='gamble'){
                const bet = parseInt(args[0]) || 100
                if(bet <=0) return sock.sendMessage(jid, {text: `Use: ${CONFIG.prefix}slots 100`})
                if(user.money < bet) return sock.sendMessage(jid, {text: `❌ You don't have $${bet}! Balance: $${user.money}`})
                const symbols = ['🍒','🍋','🍊','💎','7️⃣','🍀']
                const r = [symbols[Math.floor(Math.random()*symbols.length)], symbols[Math.floor(Math.random()*symbols.length)], symbols[Math.floor(Math.random()*symbols.length)]]
                let win = 0
                if(r[0]===r[1] && r[1]===r[2]){
                    if(r[0]==='💎' || r[0]==='7️⃣') win = bet*10
                    else win = bet*5
                } else if(r[0]===r[1] || r[1]===r[2] || r[0]===r[2]) win = bet*2
                
                if(win>0){ user.money += win; var result = `🎉 WIN $${win}!` }
                else { user.money -= bet; var result = `💸 LOST $${bet}` }
                save()
                await sock.sendMessage(jid, {text: `🎰 *SLOTS* - Bet: $${bet}\n\n[ ${r[0]} | ${r[1]} | ${r[2]} ]\n\n${result}\nBalance: $${user.money}`})
            }
            else if(cmd==='shop' || cmd==='properties' || cmd==='buy'){
                if(!args[0]){
                    let shopText = `🏪 *PROPERTY SHOP*\n\n`
                    for(let k in PROPERTIES){ shopText+= `*${k}* - $${PROPERTIES[k].price} (rent $${PROPERTIES[k].rent}/day)\n` }
                    shopText+= `\nBuy: ${CONFIG.prefix}buy house`
                    return sock.sendMessage(jid, {text: shopText})
                }
                const prop = args[0].toLowerCase()
                if(!PROPERTIES[prop]) return sock.sendMessage(jid, {text: `❌ No such property! ${CONFIG.prefix}shop to see list`})
                if(user.money < PROPERTIES[prop].price) return sock.sendMessage(jid, {text: `❌ Need $${PROPERTIES[prop].price}, you have $${user.money}`})
                user.money -= PROPERTIES[prop].price
                user.properties.push(prop); save()
                await sock.sendMessage(jid, {text: `✅ Bought *${prop}* for $${PROPERTIES[prop].price}!\nBalance: $${user.money}`})
            }
            else if(cmd==='leaderboard' || cmd==='lb' || cmd==='top'){
                let sorted = Object.entries(db).sort((a,b)=>b[1].money - a[1].money).slice(0,10)
                let textLb = `🏆 *TOP 10 RICH*\n\n`
                sorted.forEach(([id, u], i)=>{ textLb+= `${i+1}. ${id.split('@')[0]} - $${u.money}\n` })
                await sock.sendMessage(jid, {text: textLb})
            }
            // ==== ADMIN COMMANDS ====
            else if(cmd==='give' || cmd==='addmoney'){
                if(!isAdmin(senderJid)) return sock.sendMessage(jid, {text: `❌ Admin only`})
                const target = msg.message.extendedTextMessage?.contextInfo?.mentionedJid?.[0] || args[0]?.replace(/[^0-9]/g,'') + '@s.whatsapp.net'
                const amount = parseInt(args[1] || args[0])
                if(!amount) return sock.sendMessage(jid, {text: `Use: ${CONFIG.prefix}give @user 1000`})
                let targetId = msg.message.extendedTextMessage?.contextInfo?.mentionedJid?.[0]
                if(!targetId){ // try find by number in args
                    let num = args[0].replace(/[^0-9]/g,'')
                    if(num) targetId = num + '@s.whatsapp.net'
                }
                if(!targetId) return sock.sendMessage(jid, {text: `Tag user! Ex: ${CONFIG.prefix}give @user 5000`})
                const tUser = getUser(targetId)
                tUser.money += amount; save()
                await sock.sendMessage(jid, {text: `✅ Gave $${amount} to @${targetId.split('@')[0]}\nNew bal: $${tUser.money}`, mentions:[targetId]})
            }
            else if(cmd==='reset' || cmd==='resetuser'){
                if(!isAdmin(senderJid)) return sock.sendMessage(jid, {text: `❌ Admin only`})
                let targetId = msg.message.extendedTextMessage?.contextInfo?.mentionedJid?.[0]
                if(!targetId){ let num = args[0]?.replace(/[^0-9]/g,''); if(num) targetId = num + '@s.whatsapp.net' }
                if(!targetId) return sock.sendMessage(jid, {text: `Use: ${CONFIG.prefix}reset @user`})
                db[targetId] = { money: CONFIG.startingMoney, properties: [], lastDaily:0, lastWork:0 }; save()
                await sock.sendMessage(jid, {text: `🔄 Reset @${targetId.split('@')[0]} to $${CONFIG.startingMoney}`, mentions:[targetId]})
            }
            else if(cmd==='setmoney'){
                if(!isAdmin(senderJid)) return
                let targetId = msg.message.extendedTextMessage?.contextInfo?.mentionedJid?.[0] || senderJid
                const amount = parseInt(args[1] || args[0])
                const t = getUser(targetId); t.money = amount; save()
                await sock.sendMessage(jid, {text: `✅ Set $${amount} for @${targetId.split('@')[0]}`, mentions:[targetId]})
            }
            else if(cmd==='menu' || cmd==='help'){
                await sock.sendMessage(jid, {text: `*${CONFIG.botName} MENU*\n\n💰 PLAYER:\n${CONFIG.prefix}bal - balance\n${CONFIG.prefix}daily - claim daily $${CONFIG.dailyAmount}\n${CONFIG.prefix}work - work for money\n${CONFIG.prefix}slots 100 - gamble\n${CONFIG.prefix}shop - buy properties\n${CONFIG.prefix}buy house - buy property\n${CONFIG.prefix}top - leaderboard\n\n👑 ADMIN (you only):\n${CONFIG.prefix}give @user 1000\n${CONFIG.prefix}reset @user\n${CONFIG.prefix}setmoney @user 5000\n\nStart with $${CONFIG.startingMoney}`})
            }

        }catch(e){console.log('err',e)}
    })
}
startBot()
