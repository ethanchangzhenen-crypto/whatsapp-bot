const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys')
const qrcode = require('qrcode-terminal')
const P = require('pino')({level:'silent'})

const ADMINS = ['6597306863@s.whatsapp.net','6597306863','6581309721@s.whatsapp.net']
let users = {}
let settings = { gamesOn:true, itemsOn:true, timerOn:true, paused:false }
let challenges = {} // group -> {active, desc, reward}

const ITEMS = ['double','reverse','freeze','eraser','totem','charm']
const EMOJI = {double:'💥',reverse:'🔄',freeze:'🧊',eraser:'💀',totem:'🗿',charm:'🍀'}

function getUser(id){
 if(!users[id]) users[id]={
   gMoney:50000, lastGamble:0, wins:0, loses:0,
   lsMoney:0, lsDay:1, lsQuota:25000, lsDayStart:Date.now(), lsSurvived:0,
   lsItems:[], lsGame:null, lsBiggest:0, lsRevUntil:0, lsCharmLeft:0
 }
 return users[id]
}
function isAdmin(s){ return ADMINS.some(a=>s.includes(a.replace('@s.whatsapp.net',''))) }
function randItem(ex){ let p=ITEMS.filter(i=>!ex.includes(i)); return p.length?p[Math.floor(Math.random()*p.length)]:null }
function fmt(ms){ let s=Math.max(0,Math.floor(ms/1000)), m=Math.floor(s/60); s%=60; return `${m}:${s.toString().padStart(2,'0')}` }
async function handleSurvive(u,jid,sock){
  u.lsSurvived++; u.lsDay++; let nq=u.lsItems.includes('freeze')?u.lsQuota:Math.floor(u.lsQuota*2.5); if(u.lsItems.includes('freeze')) u.lsItems=u.lsItems.filter(i=>i!=='freeze'); u.lsQuota=nq; u.lsMoney=0; u.lsDayStart=Date.now(); u.lsBiggest=0
  let d1=randItem(u.lsItems), d2=randItem([...u.lsItems,d1].filter(Boolean)); if(d1) u.lsItems.push(d1); if(d2&&d1!==d2&&!u.lsItems.includes(d2)) u.lsItems.push(d2)
  let msg=`🎉 DAY ${u.lsDay-1} SURVIVED! Next quota $${nq}\n🎁 Got: ${[d1,d2].filter(Boolean).map(i=>EMOJI[i]+' '+i).join(' + ')||'full inv - use items!'}`; if(u.lsSurvived%2===0) msg+='\n⭐ BONUS CHOOSE: !lschoose [item] -> !lschoose double etc'
  await sock.sendMessage(jid,{text:msg})
}

async function start(){
 const { state, saveCreds } = await useMultiFileAuthState('auth')
 const sock = makeWASocket({ auth:state, logger:P, browser:['FullBot','Chrome','1.0'] })
 sock.ev.on('creds.update', saveCreds)
 sock.ev.on('connection.update', ({connection,lastDisconnect,qr})=>{
   if(qr){ console.log('SCAN QR:'); qrcode.generate(qr,{small:true}) }
   if(connection==='close'){ if(lastDisconnect?.error?.output?.statusCode!==DisconnectReason.loggedOut) start() }
   if(connection==='open') console.log('✅ CONNECTED 6597306863')
 })

 sock.ev.on('messages.upsert', async ({messages})=>{
  for(let msg of messages){
   if(!msg.message||msg.key.fromMe) continue
   let jid=msg.key.remoteJid, sender=msg.key.participant||jid
   let text=msg.message.conversation||msg.message.extendedTextMessage?.text||''; if(!text) continue
   text=text.trim(); let low=text.toLowerCase()
   let isReply=!!msg.message.extendedTextMessage?.contextInfo?.quotedMessage
   let quotedId=msg.message.extendedTextMessage?.contextInfo?.participant
   let user=getUser(sender)

   // TIMER DEATH
   if(settings.timerOn && user.lsDayStart){
     let el=Date.now()-user.lsDayStart
     if(el>5*60*1000 && user.lsMoney<user.lsQuota){
       if(user.lsItems.includes('totem')){ user.lsItems=user.lsItems.filter(i=>i!=='totem'); user.lsDayStart=Date.now(); await sock.sendMessage(jid,{text:`🗿 @${sender.split('@')[0]} TOTEM SAVED! Day ${user.lsDay} timer reset`,mentions:[sender]}) }
       else{ user.lsDay=1; user.lsQuota=25000; user.lsMoney=0; user.lsDayStart=Date.now(); user.lsSurvived=0; user.lsItems=[]; user.lsGame=null; await sock.sendMessage(jid,{text:`💀 @${sender.split('@')[0]} DIED! 5min no quota RESET DAY 1`,mentions:[sender]}) }
     }
   }

   // ADMIN REPLY - FIXES ~unkown player
   if(isReply && isAdmin(sender)){
     let target=quotedId||sender, t=getUser(target), cmd=low
     if(cmd.startsWith('!admin pause')){ settings.paused=true; await sock.sendMessage(jid,{text:'⏸️ PAUSED'}); continue }
     if(cmd.startsWith('!admin resume')){ settings.paused=false; await sock.sendMessage(jid,{text:'▶️ RESUMED'}); continue }
     if(cmd.startsWith('!admin off games')){ settings.gamesOn=false; await sock.sendMessage(jid,{text:'Games OFF'}); continue }
     if(cmd.startsWith('!admin on games')){ settings.gamesOn=true; await sock.sendMessage(jid,{text:'Games ON'}); continue }
     if(cmd.startsWith('!admin timer off')){ settings.timerOn=false; await sock.sendMessage(jid,{text:'Timer OFF'}); continue }
     if(cmd.startsWith('!admin timer on')){ settings.timerOn=true; await sock.sendMessage(jid,{text:'Timer ON'}); continue }
     if(cmd.startsWith('!reset')){ t.gMoney=50000; t.lsDay=1; t.lsQuota=25000; t.lsMoney=0; t.lsDayStart=Date.now(); t.lsSurvived=0; t.lsItems=[]; t.wins=0; t.loses=0; await sock.sendMessage(jid,{text:`🔄 Reset @${target.split('@')[0]} to $50k + Day1`,mentions:[target]}); continue }
     if(cmd.startsWith('!addmoney')){ let a=parseInt(cmd.split(/\s+/)[1]); if(a){ t.gMoney+=a; await sock.sendMessage(jid,{text:`💰 +$${a} @${target.split('@')[0]} Now $${t.gMoney}`,mentions:[target]}) } continue }
     if(cmd.startsWith('!removemoney')){ let a=parseInt(cmd.split(/\s+/)[1]); if(a){ t.gMoney=Math.max(0,t.gMoney-a); await sock.sendMessage(jid,{text:`💸 -$${a} @${target.split('@')[0]} Now $${t.gMoney}`,mentions:[target]}) } continue }
     if(cmd.startsWith('!setmoney')){ let a=parseInt(cmd.split(/\s+/)[1]); if(!isNaN(a)){ t.gMoney=a; await sock.sendMessage(jid,{text:`Set $${a} @${target.split('@')[0]}`,mentions:[target]}) } continue }
     if(cmd.startsWith('!lsaddmoney')){ let a=parseInt(cmd.split(/\s+/)[1]); if(a){ t.lsMoney+=a; await sock.sendMessage(jid,{text:`💀 +$${a} LS ${t.lsMoney}/${t.lsQuota} @${target.split('@')[0]}`,mentions:[target]}) } continue }
     if(cmd.startsWith('!admin give')){ let it=cmd.split(' ')[2]; if(ITEMS.includes(it)&&!t.lsItems.includes(it)){ t.lsItems.push(it); await sock.sendMessage(jid,{text:`Gave ${it} @${target.split('@')[0]}`,mentions:[target]}) } continue }
     if(cmd.startsWith('!admin clear')){ t.lsItems=[]; await sock.sendMessage(jid,{text:`Cleared @${target.split('@')[0]}`,mentions:[target]}); continue }
     if(cmd.startsWith('!admin quota')){ let a=parseInt(cmd.split(' ')[2]); if(a){ t.lsQuota=a; await sock.sendMessage(jid,{text:`Quota $${a} @${target.split('@')[0]}`,mentions:[target]}) } continue }
     if(cmd.startsWith('!challenge set')){ let desc=text.slice(15); challenges[jid]={active:true,desc,reward:5000}; await sock.sendMessage(jid,{text:`🏆 CHALLENGE SET: ${desc}\nReward $5000\nPlayers use !challenge to see`}); continue }
     if(cmd.startsWith('!challenge clear')){ delete challenges[jid]; await sock.sendMessage(jid,{text:'🏆 Challenge cleared'}); continue }
   }

   if(settings.paused && low.includes('!ls')) continue

   // MENU + CHALLENGE
   if(low==='!menu'){
     let left=5*60*1000-(Date.now()-user.lsDayStart)
     let ch=challenges[jid]?`🏆 CHALLENGE: ${challenges[jid].desc} Reward $${challenges[jid].reward}\n`:''
     await sock.sendMessage(jid,{text:`💀 LOAN x GAMBLING MENU
──────────────────
⏰ Day${user.lsDay} LS $${user.lsMoney}/$${user.lsQuota} ${fmt(left)} left
🎰 Gambling $${user.gMoney} W${user.wins} L${user.loses}
${ch}──────────────────
🎰 GAMBLING (!):
!cf [bet] [h/t] - coinflip ex !cf 100 t
!rslot [bet] - Russian slot 5/6 win 1.8x ex !rslot 100
!grave [bet] - 3 graves pick !dig 1-3 ex !grave 100
!ladder [bet] - ladder climb !climb / !cashout ex !ladder 100
!coffin [bet] - 2 coffins !open 1-2 ex !coffin 100
!case [bet] - 10 cases !pick 1-10 ex !case 100
!bj [bet] - blackjack !hit !stand ex !bj 100
!bal - your gambling bal
!top - leaderboard top 5
!challenge - show current challenge

💀 LOAN SHARK (!ls):
!lsstart - start Day1 $25000 5min timer
!lsrslot [bet] - slots 65% win
!lsgrave [bet] - 3 graves !lsdig 1-3
!lsladder [bet] - !lsclimb stack
!lscoffin [bet] - !lsopen 1-2
!lscase [bet] - 10 NPC briefcase !lspick 1-10
!lsstack [bet] - dice stack 11-21 !lsstack roll !lsstop
!lsfuse [bet] - guess time !lscut 7s exact x5 off1 x2 off2 x1
!lsmirror [bet] - vs Ah Long !lsreroll x3 max !lsstay
!lstrap [bet] - 3 traps !lslift 1-3 cheese +2x !lscashout
!lsmagnet [bet] - pull random $200-4000 break 6k-9k !lspull 5 max !lscashout
!lsbal !lsquota !lsday !lsinv
🎁 ITEMS: survive day = 2 random no dup max6, every 2 days !lschoose [item]
💥double +biggest today 🧊freeze quota no inc 💀eraser -50% quota 🔄reverse 60s no loss 🗿totem save death 🍀charm 3 auto win

🔐 ADMIN reply to user:
!admin pause/resume/off/on games/timer
!reset - fix ~unkown player bug reset both
!addmoney 1000 / !removemoney / !setmoney (reply)
!lsaddmoney 1000 (reply)
!admin give totem / clear / quota 5000
!challenge set Win 3x in a row / !challenge clear
Admin 6597306863
──────────────────
Use !challenge to see task`}); continue
   }

   if(low==='!challenge'){
     let ch=challenges[jid]; if(!ch){ await sock.sendMessage(jid,{text:`🏆 NO ACTIVE CHALLENGE
Admin can set: reply with !challenge set [task]

HOW TO PLAY:
1. !menu to see games
2. !cf 100 t - bet $100 on tails
3. !lsstart to start loan shark
4. Reach quota $25k in 5min or die reset Day1
5. Day survives = get 2 random items
6. Every 2 days !lschoose one you want
7. Use items !lsuse double etc
8. Quota x2.5 each day: 25k -> 62.5k -> 156k...
9. !bal to see money

Ask admin for money: admin replies to your message with !addmoney 1000`}); continue }
     await sock.sendMessage(jid,{text:`🏆 CURRENT CHALLENGE:\n${ch.desc}\nReward: $${ch.reward}\n\nHOW TO DO IT:\n${ch.desc}\n\nComplete it and tag admin!\n!menu for games`}); continue
   }

   // BAL TOP
   if(low==='!bal'){ await sock.sendMessage(jid,{text:`💰 Gambling $${user.gMoney} | W${user.wins} L${user.loses} | LS Day${user.lsDay} $${user.lsMoney}/$${user.lsQuota} | 🎒 ${user.lsItems.join(',')||'empty'}`}); continue }
   if(low==='!top'){ let top=Object.entries(users).sort((a,b)=>b[1].gMoney-a[1].gMoney).slice(0,5).map((u,i)=>`${i+1}. @${u[0].split('@')[0]} $${u[1].gMoney}`).join('\n'); await sock.sendMessage(jid,{text:`🏆 TOP 5 GAMBLING\n${top||'No players'}`,mentions:Object.keys(users).slice(0,5)}); continue }
   if(low.startsWith('!lsbal')||low.startsWith('!lsquota')||low.startsWith('!lsday')){ await sock.sendMessage(jid,{text:`Day${user.lsDay} $${user.lsMoney}/$${user.lsQuota} Need $${Math.max(0,user.lsQuota-user.lsMoney)} Time ${fmt(5*60*1000-(Date.now()-user.lsDayStart))}\n🎒 ${user.lsItems.map(i=>EMOJI[i]+i).join(',')||'empty'}`}); continue }
   if(low.startsWith('!lsinv')){ await sock.sendMessage(jid,{text:`🎒 ${user.lsItems.map(i=>EMOJI[i]+' '+i).join(', ')||'empty'} | Survived ${user.lsSurvived} | Every 2 days !lschoose`}); continue }
   if(low.startsWith('!lschoose')){
     if(user.lsSurvived%2!==0||user.lsSurvived===0){ await sock.sendMessage(jid,{text:`❌ Every 2 days only! Survived ${user.lsSurvived}`}); continue }
     let it=text.split(' ')[1]?.toLowerCase(); if(!ITEMS.includes(it)){ await sock.sendMessage(jid,{text:'Choose: '+ITEMS.join(', ')}); continue }
     if(user.lsItems.includes(it)||user.lsItems.length>=6){ await sock.sendMessage(jid,{text:'Have/full'}); continue }
     user.lsItems.push(it); await sock.sendMessage(jid,{text:`✅ Chose ${EMOJI[it]} ${it}`}); continue
   }

   // GAMBLING FULL
   if(low.startsWith('!cf')){
     let p=text.split(/\s+/), bet=parseInt(p[1])||100, ch=(p[2]||'h')[0]; if(bet<=0) bet=100
     if(bet>user.gMoney){ await sock.sendMessage(jid,{text:`❌ No money Bal $${user.gMoney}`}); continue }
     if(Date.now()-user.lastGamble<800) continue
     user.lastGamble=Date.now()
     let r=Math.random()<0.5?'h':'t', win=r===ch; if(win){ user.gMoney+=bet; user.wins++ } else { user.gMoney-=bet; user.loses++ }
     await sock.sendMessage(jid,{text:`${win?'✅':'🌑'} ${r==='h'?'HEADS':'TAILS'} ${win?'WIN':'LOSE'} ${win?'+':'-'}$${bet}\n💰 Bal: $${user.gMoney} | !cf again`})
     if(challenges[jid]&&challenges[jid].desc.toLowerCase().includes('win 3')&&user.wins>=3){ await sock.sendMessage(jid,{text:`🏆 @${sender.split('@')[0]} COMPLETED CHALLENGE! ${challenges[jid].desc}`,mentions:[sender]}) }
     continue
   }
   if(low.startsWith('!rslot')&&!low.startsWith('!lsrslot')){
     let bet=parseInt(text.split(' ')[1])||100; if(bet>user.gMoney){ await sock.sendMessage(jid,{text:'No money'}); continue }
     let win=Math.random()<0.833; if(win){ user.gMoney+=Math.floor(bet*0.8); user.wins++ } else { user.gMoney-=bet; user.loses++ }
     await sock.sendMessage(jid,{text:`🎰 ${win?'✅ WIN +'+Math.floor(bet*0.8):'❌ LOSE -'+bet} Bal $${user.gMoney}\n!rslot ${bet} again or !menu`}); continue
   }
   if((low.startsWith('!grave')&&!low.startsWith('!lsgrave'))||low.startsWith('!coffin')&&!low.startsWith('!lscoffin')){
     let isCoffin=low.startsWith('!coffin'); let bet=parseInt(text.split(' ')[1])||100; if(bet>user.gMoney){ await sock.sendMessage(jid,{text:'No money'}); continue }
     user.lsGame={type:isCoffin?'gcoffin':'ggrave', bet, safe:Math.floor(Math.random()*(isCoffin?2:3))+1, isCoffin}
     await sock.sendMessage(jid,{text:`${isCoffin?'⚰️':'🪦'} ${isCoffin?'2 COFFINS':'3 GRAVES'} bet $${bet} !${isCoffin?'open':'dig'} 1-${isCoffin?2:3}\nHOW: Pick a ${isCoffin?'coffin':'grave'} that is NOT empty`}); continue
   }
   if((low.startsWith('!dig')||low.startsWith('!open'))&&['ggrave','gcoffin'].includes(user.lsGame?.type)){
     let n=parseInt(low.split(' ')[1]); let win=n!==user.lsGame.safe, bet=user.lsGame.bet; user.lsGame=null
     if(win){ let p=Math.floor(bet*(user.lsGame?.isCoffin?1:0.5)); user.gMoney+=p; user.wins++; await sock.sendMessage(jid,{text:`✅ SAFE! WIN +$${p} Bal $${user.gMoney}`}) } else { user.gMoney-=bet; user.loses++; await sock.sendMessage(jid,{text:`💀 EMPTY! LOSE $${bet} Bal $${user.gMoney}`}) }
     continue
   }
   if(low.startsWith('!ladder')&&!low.startsWith('!lsladder')){
     let bet=parseInt(text.split(' ')[1])||100; if(bet>user.gMoney){ await sock.sendMessage(jid,{text:'No money'}); continue }
     user.lsGame={type:'gladder', bet, step:0, pot:bet}
     await sock.sendMessage(jid,{text:`🪜 LADDER bet $${bet} !climb +1.5x stack !cashout\nStep 0 Pot $${bet} HOW: !climb to go up risk fall, !cashout to leave`}); continue
   }
   if(low==='!climb'&&user.lsGame?.type==='gladder'){
     let fall=Math.random()<0.3; if(fall){ let b=user.lsGame.bet; user.lsGame=null; user.gMoney-=b; user.loses++; await sock.sendMessage(jid,{text:`💥 FELL! LOSE $${b} Bal $${user.gMoney}`}); continue }
     user.lsGame.step++; user.lsGame.pot=Math.floor(user.lsGame.pot*1.5); await sock.sendMessage(jid,{text:`🪜 Step ${user.lsGame.step} Pot $${user.lsGame.pot} !climb / !cashout`}); continue
   }
   if(low==='!cashout'&&user.lsGame?.type==='gladder'){ let pot=user.lsGame.pot; user.lsGame=null; user.gMoney+=pot-user.lsGame?.bet||0; user.wins++; await sock.sendMessage(jid,{text:`💰 CASHOUT $${pot} Bal $${user.gMoney}`}); continue }

   if(low.startsWith('!case')&&!low.startsWith('!lscase')){
     let bet=parseInt(text.split(' ')[1])||100; if(bet>user.gMoney){ await sock.sendMessage(jid,{text:'No money'}); continue }
     user.lsGame={type:'gcase', bet, cases:Array.from({length:10},(_,i)=>({id:i+1,val:Math.floor(Math.random()*bet*3)}))}
     await sock.sendMessage(jid,{text:`💼 10 CASES [1-10] bet $${bet} !pick 1-10\nHOW: Pick a case, get random inside $0 to $${bet*3}`}); continue
   }
   if(low.startsWith('!pick')&&user.lsGame?.type==='gcase'){
     let n=parseInt(low.split(' ')[1]); let c=user.lsGame.cases[n-1]; if(!c){ await sock.sendMessage(jid,{text:'1-10 only'}); continue }
     let bet=user.lsGame.bet; user.lsGame=null; user.gMoney+=c.val-bet; if(c.val>bet) user.wins++; else user.loses++
     await sock.sendMessage(jid,{text:`💼 Case ${n} = $${c.val} ${c.val>bet?`WIN +$${c.val-bet}`:`LOSE -$${bet-c.val}`} Bal $${user.gMoney}`}); continue
   }
   if(low.startsWith('!bj')){
     let bet=parseInt(text.split(' ')[1])||100; if(bet>user.gMoney){ await sock.sendMessage(jid,{text:'No money'}); continue }
     user.lsGame={type:'gbj', bet, you:Math.floor(Math.random()*11)+10, dealer:Math.floor(Math.random()*11)+10}
     await sock.sendMessage(jid,{text:`🃏 BJ YOU ${user.lsGame.you} vs DEALER ${user.lsGame.dealer} bet $${bet} !hit !stand\nHOW: !hit get +1-10 risk bust >21, !stand stop`}); continue
   }
   if(low==='!hit'&&user.lsGame?.type==='gbj'){ user.lsGame.you+=Math.floor(Math.random()*10)+1; if(user.lsGame.you>21){ let b=user.lsGame.bet; user.lsGame=null; user.gMoney-=b; user.loses++; await sock.sendMessage(jid,{text:`💥 BUST ${user.lsGame?.you||'>21'} LOSE $${b} Bal $${user.gMoney}`}); continue } await sock.sendMessage(jid,{text:`🃏 YOU ${user.lsGame.you} vs ${user.lsGame.dealer} !hit / !stand`}); continue }
   if(low==='!stand'&&user.lsGame?.type==='gbj'){ let b=user.lsGame.bet, win=user.lsGame.you>user.lsGame.dealer; user.lsGame=null; if(win){ user.gMoney+=b; user.wins++; await sock.sendMessage(jid,{text:`✅ BJ WIN YOU ${user.lsGame?.you||'?'} > DEALER +$${b} Bal $${user.gMoney}`}) } else { user.gMoney-=b; user.loses++; await sock.sendMessage(jid,{text:`❌ BJ LOSE $${b} Bal $${user.gMoney}`}) } continue }

   if(!settings.gamesOn) continue
   // LOAN START
   if(low.startsWith('!lsstart')){ user.lsDay=1; user.lsQuota=25000; user.lsMoney=0; user.lsDayStart=Date.now(); user.lsItems=[]; user.lsSurvived=0; user.lsGame=null; await sock.sendMessage(jid,{text:'💀 LOAN START Day1 $25000 5min timer started! !lsrslot 100\nHOW: Win games to reach quota before 5min or die reset Day1'}); continue }

   // LS RSLOT
   if(low.startsWith('!lsrslot')){
     let bet=parseInt(text.split(' ')[1])||100, charm=user.lsItems.includes('charm')||user.lsCharmLeft>0, win=charm?true:Math.random()<0.65
     if(user.lsCharmLeft>0) user.lsCharmLeft--; if(user.lsItems.includes('charm')){ user.lsItems=user.lsItems.filter(i=>i!=='charm'); user.lsCharmLeft=2 }
     let rev=Date.now()<user.lsRevUntil; if(!win&&rev) win=true
     let profit=Math.floor(bet*1.8)
     if(win){ user.lsMoney+=profit; user.lsBiggest=Math.max(user.lsBiggest,profit); await sock.sendMessage(jid,{text:`✅ LS RSLOT WIN +$${profit} ${user.lsMoney}/${user.lsQuota} HOW: reach quota ${user.lsQuota}`}) } else await sock.sendMessage(jid,{text:`❌ RSLOT LOSE $${bet}`})
     if(user.lsMoney>=user.lsQuota) await handleSurvive(user,jid,sock); continue
   }
   // LS GRAVE
   if(low.startsWith('!lsgrave')&&(!user.lsGame||user.lsGame.type!=='lsgrave')){
     let bet=parseInt(text.split(' ')[1])||100; user.lsGame={type:'lsgrave', bet, safe:Math.floor(Math.random()*3)+1, dug:[], pot:bet}
     await sock.sendMessage(jid,{text:`⚰️ LS GRAVE 3 [1][2][3] bet $${bet} !lsdig 1-3 HOW: 2 safe +1.5x pot, 1 empty lose`}); continue
   }
   if(low.startsWith('!lsdig')&&user.lsGame?.type==='lsgrave'){
     let n=parseInt(low.split(' ')[1]); if(user.lsGame.dug.includes(n)){ await sock.sendMessage(jid,{text:'Dug already'}); continue }
     user.lsGame.dug.push(n)
     if(n===user.lsGame.safe){ let b=user.lsGame.bet; user.lsGame=null; await sock.sendMessage(jid,{text:`💀 EMPTY LOSE $${b}`}); continue }
     user.lsGame.pot=Math.floor(user.lsGame.pot*1.5); await sock.sendMessage(jid,{text:`✅ SAFE Pot $${user.lsGame.pot} !lsdig again or !lscashout HOW: dig other safe then cashout`})
     if(user.lsGame.dug.length===2){ user.lsMoney+=user.lsGame.pot; await sock.sendMessage(jid,{text:`🎉 BOTH SAFE WIN $${user.lsGame.pot} ${user.lsMoney}/${user.lsQuota}`}); user.lsGame=null; if(user.lsMoney>=user.lsQuota) await handleSurvive(user,jid,sock) }
     continue
   }
   if(low==='!lscashout'&&user.lsGame?.type==='lsgrave'){ user.lsMoney+=user.lsGame.pot; let pot=user.lsGame.pot; user.lsGame=null; await sock.sendMessage(jid,{text:`💰 CASHOUT $${pot} ${user.lsMoney}/${user.lsQuota}`}); if(user.lsMoney>=user.lsQuota) await handleSurvive(user,jid,sock); continue }
   // LS STACK
   if(low.startsWith('!lsstack')&&(!user.lsGame||user.lsGame.type!=='lsstack')){
     let bet=parseInt(text.split(' ')[1])||100; user.lsGame={type:'lsstack', total:0, bet}
     await sock.sendMessage(jid,{text:`🎲 STACK $${bet} Total 0 !lsstack roll !lsstop HOW: 0-10=0 11-14 x1 15-17 x1.8 18-20 x2.5 21 x4 1/22+ bust`}); continue
   }
   if(low==='!lsstack'&&user.lsGame?.type==='lsstack'){
     let roll=Math.floor(Math.random()*6)+1; if(roll===1){ let b=user.lsGame.bet; user.lsGame=null; await sock.sendMessage(jid,{text:`💥 ROLL 1 COLLAPSE LOSE $${b}`}); continue }
     user.lsGame.total+=roll; if(user.lsGame.total>=22){ let b=user.lsGame.bet; user.lsGame=null; await sock.sendMessage(jid,{text:`💥 BUST ${user.lsGame.total} LOSE $${b}`}); continue }
     await sock.sendMessage(jid,{text:`🎲 Roll ${roll} Total ${user.lsGame.total} !lsstack / !lsstop HOW: stop before bust`}); continue
   }
   if(low==='!lsstop'&&user.lsGame?.type==='lsstack'){
     let t=user.lsGame.total, b=user.lsGame.bet, w=0; if(t<=10) w=0; else if(t<=14) w=b*1; else if(t<=17) w=b*1.8; else if(t<=20) w=b*2.5; else if(t===21) w=b*4; user.lsMoney+=Math.floor(w); user.lsGame=null; await sock.sendMessage(jid,{text:`🛑 STOP ${t} WIN $${Math.floor(w)} ${user.lsMoney}/${user.lsQuota}`}); if(user.lsMoney>=user.lsQuota) await handleSurvive(user,jid,sock); continue
   }
   // LS FUSE
   if(low.startsWith('!lsfuse')&&(!user.lsGame||user.lsGame.type!=='lsfuse')){
     let bet=parseInt(text.split(' ')[1])||100; user.lsGame={type:'lsfuse', bet, actual:Math.floor(Math.random()*10)+1}
     await sock.sendMessage(jid,{text:`🧨 FUSE bet $${bet} hidden 1-10s !lscut 7s HOW: guess exact time x5 off1 x2 off2 x1 else lose`}); continue
   }
   if(low.startsWith('!lscut')&&user.lsGame?.type==='lsfuse'){
     let g=parseInt(low.match(/\d+/)?.[0]); let a=user.lsGame.actual, b=user.lsGame.bet, d=Math.abs(g-a), w=d===0?b*5:d===1?b*2:d===2?b*1:-b; if(w>0) user.lsMoney+=Math.floor(w); await sock.sendMessage(jid,{text:`🧨 Actual ${a}s You ${g}s ${d===0?'JACKPOT x5':d===1?'Close x2':d===2?'Even x1':'LOSE'} ${w>0?`+$${Math.floor(w)}`:`-$${b}`} ${user.lsMoney}/${user.lsQuota}`}); user.lsGame=null; if(user.lsMoney>=user.lsQuota) await handleSurvive(user,jid,sock); continue
   }
   // LS MIRROR
   if(low.startsWith('!lsmirror')&&(!user.lsGame||user.lsGame.type!=='lsmirror')){
     let bet=parseInt(text.split(' ')[1])||100; user.lsGame={type:'lsmirror', bet, you:Math.floor(Math.random()*13)+1, ah:Math.floor(Math.random()*13)+1, rerolls:3}
     await sock.sendMessage(jid,{text:`🪞 YOU ${user.lsGame.you} vs AH LONG ${user.lsGame.ah} bet $${bet} ${user.lsGame.you>user.lsGame.ah?'WIN':'LOSE'} !lsreroll x${user.lsGame.rerolls} / !lsstay HOW: reroll your number 3 times max, higher than Ah Long win`}); continue
   }
   if(low==='!lsreroll'&&user.lsGame?.type==='lsmirror'){
     if(user.lsGame.rerolls<=0){ await sock.sendMessage(jid,{text:'No rerolls left !lsstay'}); continue }
     user.lsGame.rerolls--; user.lsGame.you=Math.floor(Math.random()*13)+1; await sock.sendMessage(jid,{text:`🪞 REROLL YOU ${user.lsGame.you} vs ${user.lsGame.ah} Left ${user.lsGame.rerolls} !lsreroll / !lsstay`}); continue
   }
   if(low==='!lsstay'&&user.lsGame?.type==='lsmirror'){
     let b=user.lsGame.bet, win=user.lsGame.you>user.lsGame.ah, tie=user.lsGame.you===user.lsGame.ah; user.lsGame=null
     if(tie){ user.lsMoney-=Math.floor(b/2); await sock.sendMessage(jid,{text:`🪞 TIE lose half $${Math.floor(b/2)}`}); continue }
     if(win){ user.lsMoney+=Math.floor(b*1.8); await sock.sendMessage(jid,{text:`✅ MIRROR WIN +$${Math.floor(b*1.8)} ${user.lsMoney}/${user.lsQuota}`}) } else await sock.sendMessage(jid,{text:`❌ MIRROR LOSE $${b}`})
     if(user.lsMoney>=user.lsQuota) await handleSurvive(user,jid,sock); continue
   }
   // LS TRAP
   if(low.startsWith('!lstrap')&&(!user.lsGame||user.lsGame.type!=='lstrap')){
     let bet=parseInt(text.split(' ')[1])||100; user.lsGame={type:'lstrap', bet, pot:0}
     await sock.sendMessage(jid,{text:`🪤 TRAPS [1][2][3] bet $${bet} !lslift 1-3 HOW: cheese +2x pot stack, trap lose pot only !lscashout`}); continue
   }
   if(low.startsWith('!lslift')&&user.lsGame?.type==='lstrap'){
     let win=Math.random()<0.33; if(win){ user.lsGame.pot+=user.lsGame.bet*2; await sock.sendMessage(jid,{text:`🧀 CHEESE Pot $${user.lsGame.pot} !lslift / !lscashout`}) } else { let pot=user.lsGame.pot; user.lsGame.pot=0; await sock.sendMessage(jid,{text:`💥 TRAP! Lost pot $${pot} Pot $0`}) } continue
   }
   if(low==='!lscashout'&&user.lsGame?.type==='lstrap'){ user.lsMoney+=user.lsGame.pot; let pot=user.lsGame.pot; user.lsGame=null; await sock.sendMessage(jid,{text:`💰 CASHOUT $${pot} ${user.lsMoney}/${user.lsQuota}`}); if(user.lsMoney>=user.lsQuota) await handleSurvive(user,jid,sock); continue }
   // LS MAGNET
   if(low.startsWith('!lsmagnet')&&(!user.lsGame||user.lsGame.type!=='lsmagnet')){
     let bet=parseInt(text.split(' ')[1])||100; user.lsGame={type:'lsmagnet', bet, pot:0, limit:6000+Math.floor(Math.random()*3000), pulls:0}
     await sock.sendMessage(jid,{text:`🧲 MAGNET bet $${bet} hidden break 6k-9k !lspull random $200-4000 max5 HOW: pull $ but over limit break lose bet`}); continue
   }
   if(low==='!lspull'&&user.lsGame?.type==='lsmagnet'){
     if(user.lsGame.pulls>=5){ await sock.sendMessage(jid,{text:'Max 5 !lscashout'}); continue }
     let pull=200+Math.floor(Math.random()*3800); user.lsGame.pot+=pull; user.lsGame.pulls++
     if(user.lsGame.pot>user.lsGame.limit){ let b=user.lsGame.bet; user.lsGame=null; await sock.sendMessage(jid,{text:`💥 BREAK Pot over hidden limit LOSE $${b}`}); continue }
     await sock.sendMessage(jid,{text:`🧲 Pulled $${pull} Total $${user.lsGame.pot} ${user.lsGame.pulls}/5 !lspull / !lscashout`}); continue
   }
   if(low==='!lscashout'&&user.lsGame?.type==='lsmagnet'){ user.lsMoney+=user.lsGame.pot; let pot=user.lsGame.pot; user.lsGame=null; await sock.sendMessage(jid,{text:`💰 CASHOUT $${pot} ${user.lsMoney}/${user.lsQuota}`}); if(user.lsMoney>=user.lsQuota) await handleSurvive(user,jid,sock); continue }
   // LS OTHER
   if(low.startsWith('!lscase')||low.startsWith('!lsladder')||low.startsWith('!lscoffin')){
     let bet=parseInt(text.split(' ')[1])||100; let charm=user.lsItems.includes('charm')||user.lsCharmLeft>0; let win=charm?true:Math.random()<0.55
     if(user.lsCharmLeft>0) user.lsCharmLeft--; if(user.lsItems.includes('charm')){ user.lsItems=user.lsItems.filter(i=>i!=='charm'); user.lsCharmLeft=2 }
     if(win){ let p=Math.floor(bet*1.6); user.lsMoney+=p; await sock.sendMessage(jid,{text:`✅ ${low.split(' ')[0]} WIN +$${p} ${user.lsMoney}/${user.lsQuota}`}) } else await sock.sendMessage(jid,{text:`❌ ${low.split(' ')[0]} LOSE $${bet}`})
     if(user.lsMoney>=user.lsQuota) await handleSurvive(user,jid,sock); continue
   }
   // ITEM USE
   if(low.startsWith('!lsuse')||['!lsdouble','!lsreverse','!lsfreeze','!lseraser','!lstotem','!lscharm'].includes(low.split(' ')[0])){
     let it=low.replace('!lsuse','').replace('!ls','').trim().split(' ')[0]; if(!ITEMS.includes(it)) continue; if(!user.lsItems.includes(it)){ await sock.sendMessage(jid,{text:'No '+it}); continue }
     if(it==='eraser'){ user.lsQuota=Math.floor(user.lsQuota/2); user.lsItems=user.lsItems.filter(i=>i!==it); await sock.sendMessage(jid,{text:`💀 ERASER New quota $${user.lsQuota}`}) }
     else if(it==='reverse'){ user.lsRevUntil=Date.now()+60000; user.lsItems=user.lsItems.filter(i=>i!==it); await sock.sendMessage(jid,{text:'🔄 REVERSE 60s no loss'}) }
     else if(it==='double'){ user.lsItems=user.lsItems.filter(i=>i!==it); let b=user.lsBiggest||1000; user.lsMoney+=b; await sock.sendMessage(jid,{text:`💥 DOUBLE +$${b} ${user.lsMoney}/${user.lsQuota}`}) }
     else if(it==='charm'){ user.lsItems=user.lsItems.filter(i=>i!==it); user.lsCharmLeft=2; await sock.sendMessage(jid,{text:'🍀 CHARM 3 auto win armed'}) }
     else if(it==='freeze'){ await sock.sendMessage(jid,{text:'🧊 FREEZE armed next day no x2.5'}) }
     else await sock.sendMessage(jid,{text:`🗿 TOTEM passive save death`})
     continue
   }
  }
 })
}
start()
