const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, makeCacheableSignalKeyStore } = require("@whiskeysockets/baileys")
const fs = require("fs")
const path = require("path")
const qrcode = require("qrcode-terminal")
const P = require("pino")
const logger = P({ level: 'silent' })

const DB_FILE = './fishing_db.json';
let db = { users: {} };
if (fs.existsSync(DB_FILE)) { try { db = JSON.parse(fs.readFileSync(DB_FILE)); } catch(e){} }
function saveDB() { fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2)); }
function getUser(id) {
  if (!db.users[id]) db.users[id] = { inventory: [], money: 100, location: 'lake', rods: ['Wooden Rod'], currentRod: 'Wooden Rod', totalCaught: 0, heaviest: 0 };
  return db.users[id];
}

const MEME_IMG = './memes/images'; const MEME_VID = './memes/videos';
if (!fs.existsSync(MEME_IMG)) fs.mkdirSync(MEME_IMG, { recursive: true });
if (!fs.existsSync(MEME_VID)) fs.mkdirSync(MEME_VID, { recursive: true });

// --- 64 FISH + 12 STACKABLE MUTATIONS - SAME AS LONG ---
const LOCATIONS = {
  lake: ["Minnow","Bluegill","Largemouth Bass","Carp","Catfish","Perch","Crappie","Lake Sturgeon"],
  river: ["Trout","Salmon","Pike","Walleye","Smallmouth Bass","River Eel","Stickleback","River Monster"],
  ocean: ["Mackerel","Tuna","Swordfish","Shark","Clownfish","Barracuda","Marlin","Ocean Sunfish"],
  volcano: ["Lava Eel","Magma Carp","Obsidian Bass","Ash Trout","Fire Guppy","Volcano Shark","Cinder Crab","Lava Leviathan"],
  ice: ["Icefish","Frost Minnow","Snow Trout","Ice Pike","Narwhal","Frost Shark","Glacier Eel","Ice Kraken"],
  toxic: ["Mutant Frog","Toxic Bass","Sludge Eel","Radioactive Carp","Sewer Guppy","Acid Shark","Waste Crab","Toxic Leviathan"],
  sky: ["Cloud Koi","Storm Ray","Sky Bass","Thunder Eel","Wind Trout","Balloon Fish","Angel Fish","Sky Whale"],
  abyss: ["Anglerfish","Blobfish","Giant Squid","Abyss Leviathan","Void Kraken","Deep Sea Dragon","Ghost Shark","God Fish"]
};
const FISH_DATA = {"Minnow":{rarity:"Common",price:5,min:0.1,max:0.5},"Bluegill":{rarity:"Common",price:10,min:0.2,max:0.8},"Largemouth Bass":{rarity:"Uncommon",price:25,min:0.5,max:2},"Carp":{rarity:"Common",price:15,min:0.8,max:3},"Catfish":{rarity:"Uncommon",price:30,min:1,max:4},"Perch":{rarity:"Common",price:12,min:0.3,max:1},"Crappie":{rarity:"Common",price:12,min:0.2,max:1},"Lake Sturgeon":{rarity:"Rare",price:150,min:3,max:10},"Trout":{rarity:"Uncommon",price:30,min:0.5,max:2.5},"Salmon":{rarity:"Uncommon",price:40,min:1,max:5},"Pike":{rarity:"Rare",price:80,min:1,max:6},"Walleye":{rarity:"Uncommon",price:35,min:0.6,max:3},"Smallmouth Bass":{rarity:"Common",price:20,min:0.4,max:2},"River Eel":{rarity:"Rare",price:90,min:0.5,max:4},"Stickleback":{rarity:"Common",price:5,min:0.05,max:0.3},"River Monster":{rarity:"Epic",price:400,min:5,max:20},"Mackerel":{rarity:"Common",price:18,min:0.3,max:1.5},"Tuna":{rarity:"Rare",price:120,min:2,max:15},"Swordfish":{rarity:"Epic",price:600,min:5,max:30},"Shark":{rarity:"Epic",price:500,min:4,max:25},"Clownfish":{rarity:"Common",price:15,min:0.1,max:0.5},"Barracuda":{rarity:"Rare",price:100,min:1,max:8},"Marlin":{rarity:"Epic",price:700,min:6,max:35},"Ocean Sunfish":{rarity:"Legendary",price:2000,min:10,max:50},"Lava Eel":{rarity:"Rare",price:200,min:1,max:5},"Magma Carp":{rarity:"Uncommon",price:60,min:0.8,max:4},"Obsidian Bass":{rarity:"Epic",price:800,min:3,max:15},"Ash Trout":{rarity:"Common",price:25,min:0.5,max:2},"Fire Guppy":{rarity:"Common",price:10,min:0.1,max:0.4},"Volcano Shark":{rarity:"Legendary",price:3000,min:8,max:40},"Cinder Crab":{rarity:"Rare",price:180,min:0.5,max:3},"Lava Leviathan":{rarity:"Mythic",price:10000,min:20,max:100},"Icefish":{rarity:"Common",price:20,min:0.3,max:1.2},"Frost Minnow":{rarity:"Common",price:8,min:0.1,max:0.5},"Snow Trout":{rarity:"Uncommon",price:40,min:0.6,max:3},"Ice Pike":{rarity:"Rare",price:150,min:2,max:8},"Narwhal":{rarity:"Epic",price:600,min:4,max:20},"Frost Shark":{rarity:"Epic",price:750,min:5,max:25},"Glacier Eel":{rarity:"Rare",price:200,min:1,max:6},"Ice Kraken":{rarity:"Mythic",price:12000,min:25,max:120},"Mutant Frog":{rarity:"Common",price:30,min:0.2,max:1},"Toxic Bass":{rarity:"Uncommon",price:50,min:0.5,max:3},"Sludge Eel":{rarity:"Rare",price:180,min:1,max:5},"Radioactive Carp":{rarity:"Rare",price:220,min:1,max:6},"Sewer Guppy":{rarity:"Common",price:12,min:0.1,max:0.6},"Acid Shark":{rarity:"Epic",price:900,min:4,max:20},"Waste Crab":{rarity:"Uncommon",price:45,min:0.3,max:2},"Toxic Leviathan":{rarity:"Mythic",price:15000,min:20,max:90},"Cloud Koi":{rarity:"Uncommon",price:70,min:0.5,max:2.5},"Storm Ray":{rarity:"Epic",price:650,min:3,max:15},"Sky Bass":{rarity:"Common",price:22,min:0.4,max:2},"Thunder Eel":{rarity:"Rare",price:250,min:1,max:7},"Wind Trout":{rarity:"Common",price:28,min:0.5,max:2},"Balloon Fish":{rarity:"Rare",price:160,min:0.8,max:4},"Angel Fish":{rarity:"Epic",price:800,min:2,max:10},"Sky Whale":{rarity:"Mythic",price:20000,min:30,max:150},"Anglerfish":{rarity:"Rare",price:300,min:1,max:6},"Blobfish":{rarity:"Uncommon",price:60,min:0.5,max:3},"Giant Squid":{rarity:"Epic",price:1000,min:5,max:30},"Abyss Leviathan":{rarity:"Mythic",price:25000,min:30,max:200},"Void Kraken":{rarity:"Mythic",price:30000,min:40,max:250},"Deep Sea Dragon":{rarity:"Legendary",price:5000,min:10,max:60},"Ghost Shark":{rarity:"Legendary",price:4000,min:8,max:40},"God Fish":{rarity:"God",price:100000,min:50,max:500}};
const MUTATIONS = [{name:"Golden",emoji:"🌟",chance:0.08,priceMult:2,weightMult:1.1},{name:"Diamond",emoji:"💎",chance:0.04,priceMult:4,weightMult:1.2},{name:"Albino",emoji:"👻",chance:0.07,priceMult:1.8,weightMult:0.9},{name:"Toxic",emoji:"☣️",chance:0.06,priceMult:2.5,weightMult:1.1},{name:"Frozen",emoji:"❄️",chance:0.06,priceMult:2.2,weightMult:1.15},{name:"Lava",emoji:"🌋",chance:0.05,priceMult:3,weightMult:1.2},{name:"Void",emoji:"🕳️",chance:0.02,priceMult:8,weightMult:1.3},{name:"Cosmic",emoji:"🌌",chance:0.015,priceMult:10,weightMult:1.4},{name:"Mutated",emoji:"🧬",chance:0.09,priceMult:1.5,weightMult:1.25},{name:"Giant",emoji:"🦍",chance:0.05,priceMult:1.5,weightMult:2},{name:"Tiny",emoji:"🐛",chance:0.05,priceMult:1.2,weightMult:0.3},{name:"Rainbow",emoji:"🌈",chance:0.01,priceMult:15,weightMult:1.5}];
function getRandomFish(location, rod){const pool=LOCATIONS[location]||LOCATIONS.lake; const fishName=pool[Math.floor(Math.random()*pool.length)]; const base=FISH_DATA[fishName]; let w=(Math.random()*(base.max-base.min)+base.min); let p=base.price; let muts=[]; MUTATIONS.forEach(m=>{let c=m.chance; if(rod&&rod.includes('Mythic'))c*=1.5; if(Math.random()<c){muts.push(m); p*=m.priceMult; w*=m.weightMult;}}); let final=muts.length?muts.map(m=>m.name).join(' ')+' '+fishName:fishName; return {name:final,baseName:fishName,mutations:muts,rarity:base.rarity,weight:parseFloat(w.toFixed(2)),price:Math.floor(p*(w/base.min)),location};}

// DEBATE - FULL
const DEBATE_SCENARIOS = {
  easy: ["You ate your friend's entire birthday cake and said it was a diet plan","You brought a live goat to school as emotional support","You replaced office coffee with decaf for 6 months","You yelled I AM THE LIZARD KING in library","You taught grandma to say skibidi"],
  hard: ["You sold friend's limited sneakers to buy 10,000 rubber ducks","You faked sick for 2 weeks to avoid group project","You leaked group chat screenshots to crush","You told everyone friend sleeps with nightlight","You borrowed $500 and spent on gacha"],
  impossible: ["You killed a clown because he looked funny","You burned down McDonald's forgot nuggets","You kidnapped school mascot ransom 5 v-bucks","You erased friend's Minecraft world 4 years","You robbed bank with water gun"]
};
const DEBATE_COUNTERS = { easy: ["Lol that's it? Explain better."], hard: ["That's selfish. What about others?"], impossible: ["You committed CRIME and think okay? Defend MORALITY."] };
let activeDebates = {};

async function start(){
  const { state, saveCreds } = await useMultiFileAuthState("auth_info")
  const sock = makeWASocket({ auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, logger) }, logger, browser: ["Fishing Bot","Chrome","1"] })
  sock.ev.on("creds.update", saveCreds)
  sock.ev.on("connection.update", u=>{
    if(u.qr) qrcode.generate(u.qr,{small:true})
    if(u.connection==="open") console.log("✅ BOT READY - FISHING+MEME+DEBATE")
    if(u.connection==="close") start()
  })

  sock.ev.on("messages.upsert", async ({messages})=>{
    for(const m of messages){
      if(!m.message) continue
      const jid=m.key.remoteJid; const sender=m.key.participant||jid
      const text=(m.message.conversation||m.message.extendedTextMessage?.text||"").trim()
      if(!text) continue
      const lower=text.toLowerCase(); const user=getUser(sender)

      if(lower==="!help"||lower==="!menu"){
        await sock.sendMessage(jid,{text:`📖 FISHING+MEME+DEBATE\n!fish\n!fish_travel ocean\n!fish_inventory\n!fish_sell all\n!fish_stats\n!fish_location\n!meme\n!debate easy/hard/impossible\n!debate_end`})
        continue
      }
      if(lower==="!meme"){
        const imgs=fs.existsSync(MEME_IMG)?fs.readdirSync(MEME_IMG).filter(f=>/\.(jpg|png|webp)$/i.test(f)):[]
        const vids=fs.existsSync(MEME_VID)?fs.readdirSync(MEME_VID).filter(f=>/\.(mp4|mov)$/i.test(f)):[]
        if(imgs.length) await sock.sendMessage(jid,{image: fs.readFileSync(path.join(MEME_IMG, imgs[Math.floor(Math.random()*imgs.length)]))})
        if(vids.length) await sock.sendMessage(jid,{video: fs.readFileSync(path.join(MEME_VID, vids[Math.floor(Math.random()*vids.length)]))})
        if(!imgs.length&&!vids.length) await sock.sendMessage(jid,{text:`No memes in /memes/images or /memes/videos`})
        continue
      }
      // FISHING
      if(lower==="!fish"){
        const fish=getRandomFish(user.location,user.currentRod); 
        user.inventory.push(fish); user.totalCaught++; 
        if(fish.weight>user.heaviest) user.heaviest=fish.weight; 
        saveDB();
        const mutText=fish.mutations.length?`\n🧬 ${fish.mutations.map(m=>`${m.emoji} ${m.name} x${m.priceMult}`).join(' + ')}\n💥 ${fish.mutations.length} stacked!`:''
        await sock.sendMessage(jid,{text:`🎣 Caught *${fish.name}*!\n📍 ${fish.location} | ${fish.rarity}\n⚖️ ${fish.weight}kg\n💰 $${fish.price}${mutText}`})
        continue
      }
      if(lower.startsWith("!fish_travel")){const loc=lower.split(' ')[1]; if(!LOCATIONS[loc]){await sock.sendMessage(jid,{text:`Locations: ${Object.keys(LOCATIONS).join(', ')}`}); continue} user.location=loc; saveDB(); await sock.sendMessage(jid,{text:`✈️ Traveled to *${loc.toUpperCase()}*\nFish: ${LOCATIONS[loc].join(', ')}\n!fish to catch`}); continue}
      if(lower==="!fish_location"){await sock.sendMessage(jid,{text:`📍 You are at *${user.location}*\nFish here: ${LOCATIONS[user.location].join(', ')}\nAll: ${Object.keys(LOCATIONS).join(', ')}`}); continue}
      if(lower==="!fish_inventory"||lower==="!fish_inv"){if(!user.inventory.length){await sock.sendMessage(jid,{text:`No fish. !fish`}); continue} let out=`🎒 *${user.inventory.length} fish - ${user.location}*\n`; user.inventory.slice(-15).forEach(f=>{out+=`${f.mutations.map(m=>m.emoji).join('')}${f.name} ${f.weight}kg $${f.price}\n`}); await sock.sendMessage(jid,{text:out}); continue}
      if(lower.startsWith("!fish_sell")){const total=user.inventory.reduce((s,f)=>s+f.price,0); user.inventory=[]; user.money+=total; saveDB(); await sock.sendMessage(jid,{text:`💰 Sold all $${total} | Total $${user.money}`}); continue}
      if(lower==="!fish_stats"){await sock.sendMessage(jid,{text:`📊 Caught: ${user.totalCaught} | Heaviest: ${user.heaviest}kg | Money: $${user.money} | Location: ${user.location}\n64 fish, 12 mutations stackable`}); continue}

      // DEBATE - FIXED
      if(lower.startsWith("!debate")){
        if(lower===" !debate_end"||lower==="!debate_end"){if(activeDebates[jid]){const d=activeDebates[jid]; delete activeDebates[jid]; await sock.sendMessage(jid,{text:`⚖️ Debate ended! Crime: ${d.scenario} | Messages: ${d.messages.length}`});} else {await sock.sendMessage(jid,{text:`No debate running`});} continue}
        let diff='hard'; if(lower.includes('easy')) diff='easy'; if(lower.includes('impossible')) diff='impossible';
        if(activeDebates[jid]){await sock.sendMessage(jid,{text:`⚖️ Already running: ${activeDebates[jid].scenario}`}); continue}
        const pool=DEBATE_SCENARIOS[diff]; const scenario=pool[Math.floor(Math.random()*pool.length)];
        activeDebates[jid]={scenario,difficulty:diff,messages:[],startTime:Date.now()};
        await sock.sendMessage(jid,{text:`⚖️ *DEBATE ${diff.toUpperCase()}*\n*CRIME:* ${scenario}\n\nYou have 2 MINS to justify! I am prosecutor.\nReply to defend. !debate_end to end`});
        setTimeout(async()=>{if(activeDebates[jid]){const d=activeDebates[jid]; delete activeDebates[jid]; const win=Math.random()<(diff==='easy'?0.7:diff==='hard'?0.4:0.15)+(d.messages.length>=3?0.2:0); await sock.sendMessage(jid,{text: win?`✅ DEFENDANT WINS! "${d.scenario}"`:`❌ PROSECUTION WINS! "${d.scenario}" Guilty.`});}},120000);
        continue
      }
      if(activeDebates[jid] && !lower.startsWith('!')){
        activeDebates[jid].messages.push(text);
        const pool=DEBATE_COUNTERS[activeDebates[jid].difficulty];
        await sock.sendMessage(jid,{text:`${pool[Math.floor(Math.random()*pool.length)]} _${Math.floor((120000-(Date.now()-activeDebates[jid].startTime))/1000)}s left_`});
      }
    }
  })
}
start()
