const express = require("express");
const app = express();
let latestQR = null;
let botStatus = "Starting bot... Please wait...";

app.get("/", async (req, res) => {
  if (!latestQR) {
    return res.send(`
      <html>
      <body style="background:#111;color:white;text-align:center;padding:50px;font-family:sans-serif">
        <h1>🤖 Bot Status: ${botStatus}</h1>
        <p>Waiting for QR... auto-refresh in 5 sec</p>
        <script>setTimeout(()=>location.reload(),5000)</script>
      </body>
      </html>
    `);
  }
  // QR as image
  res.send(`
    <html>
    <body style="background:#111;color:white;text-align:center;padding:30px;font-family:sans-serif">
      <h1>📱 SCAN THIS QR ON WHATSAPP</h1>
      <p>WhatsApp > Linked Devices > Link a Device</p>
      <div style="background:white;padding:20px;display:inline-block;border-radius:20px">
        <img src="https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(latestQR)}" style="width:300px;height:300px" />
      </div>
      <p>${botStatus} - Refresh if expired (60 sec)</p>
      <script>setTimeout(()=>location.reload(),30000)</script>
    </body>
    </html>
  `);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ WEB SERVER ACTIVE ON PORT ${PORT} - DOMAIN SHOULD WORK NOW`));

// ================= FISHING BOT BELOW =================
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, makeCacheableSignalKeyStore } = require("@whiskeysockets/baileys");
const fs = require("fs");
const path = require("path");
const qrcode = require("qrcode-terminal");
const P = require("pino");
const logger = P({ level: 'silent' });

const DB_FILE = './fishing_db.json';
let db = { users: {} };
if (fs.existsSync(DB_FILE)) { 
  try { db = JSON.parse(fs.readFileSync(DB_FILE)); } catch(e){} 
}
function saveDB() { fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2)); }
function getUser(id) {
  if (!db.users[id]) db.users[id] = { inventory: [], money: 100, location: 'lake', rods: ['Wooden Rod'], currentRod: 'Wooden Rod', totalCaught: 0, heaviest: 0 };
  return db.users[id];
}

const MEME_IMG = './memes/images'; 
const MEME_VID = './memes/videos';
if (!fs.existsSync(MEME_IMG)) fs.mkdirSync(MEME_IMG, { recursive: true });
if (!fs.existsSync(MEME_VID)) fs.mkdirSync(MEME_VID, { recursive: true });

// 8 LOCATIONS - 64 FISH
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

// 64 FISH DATA - LONG PRETTY VERSION
const FISH_DATA = {
  "Minnow": { rarity: "Common", price: 5, min: 0.1, max: 0.5 },
  "Bluegill": { rarity: "Common", price: 10, min: 0.2, max: 0.8 },
  "Largemouth Bass": { rarity: "Uncommon", price: 25, min: 0.5, max: 2 },
  "Carp": { rarity: "Common", price: 15, min: 0.8, max: 3 },
  "Catfish": { rarity: "Uncommon", price: 30, min: 1, max: 4 },
  "Perch": { rarity: "Common", price: 12, min: 0.3, max: 1 },
  "Crappie": { rarity: "Common", price: 12, min: 0.2, max: 1 },
  "Lake Sturgeon": { rarity: "Rare", price: 150, min: 3, max: 10 },
  "Trout": { rarity: "Uncommon", price: 30, min: 0.5, max: 2.5 },
  "Salmon": { rarity: "Uncommon", price: 40, min: 1, max: 5 },
  "Pike": { rarity: "Rare", price: 80, min: 1, max: 6 },
  "Walleye": { rarity: "Uncommon", price: 35, min: 0.6, max: 3 },
  "Smallmouth Bass": { rarity: "Common", price: 20, min: 0.4, max: 2 },
  "River Eel": { rarity: "Rare", price: 90, min: 0.5, max: 4 },
  "Stickleback": { rarity: "Common", price: 5, min: 0.05, max: 0.3 },
  "River Monster": { rarity: "Epic", price: 400, min: 5, max: 20 },
  "Mackerel": { rarity: "Common", price: 18, min: 0.3, max: 1.5 },
  "Tuna": { rarity: "Rare", price: 120, min: 2, max: 15 },
  "Swordfish": { rarity: "Epic", price: 600, min: 5, max: 30 },
  "Shark": { rarity: "Epic", price: 500, min: 4, max: 25 },
  "Clownfish": { rarity: "Common", price: 15, min: 0.1, max: 0.5 },
  "Barracuda": { rarity: "Rare", price: 100, min: 1, max: 8 },
  "Marlin": { rarity: "Epic", price: 700, min: 6, max: 35 },
  "Ocean Sunfish": { rarity: "Legendary", price: 2000, min: 10, max: 50 },
  "Lava Eel": { rarity: "Rare", price: 200, min: 1, max: 5 },
  "Magma Carp": { rarity: "Uncommon", price: 60, min: 0.8, max: 4 },
  "Obsidian Bass": { rarity: "Epic", price: 800, min: 3, max: 15 },
  "Ash Trout": { rarity: "Common", price: 25, min: 0.5, max: 2 },
  "Fire Guppy": { rarity: "Common", price: 10, min: 0.1, max: 0.4 },
  "Volcano Shark": { rarity: "Legendary", price: 3000, min: 8, max: 40 },
  "Cinder Crab": { rarity: "Rare", price: 180, min: 0.5, max: 3 },
  "Lava Leviathan": { rarity: "Mythic", price: 10000, min: 20, max: 100 },
  "Icefish": { rarity: "Common", price: 20, min: 0.3, max: 1.2 },
  "Frost Minnow": { rarity: "Common", price: 8, min: 0.1, max: 0.5 },
  "Snow Trout": { rarity: "Uncommon", price: 40, min: 0.6, max: 3 },
  "Ice Pike": { rarity: "Rare", price: 150, min: 2, max: 8 },
  "Narwhal": { rarity: "Epic", price: 600, min: 4, max: 20 },
  "Frost Shark": { rarity: "Epic", price: 750, min: 5, max: 25 },
  "Glacier Eel": { rarity: "Rare", price: 200, min: 1, max: 6 },
  "Ice Kraken": { rarity: "Mythic", price: 12000, min: 25, max: 120 },
  "Mutant Frog": { rarity: "Common", price: 30, min: 0.2, max: 1 },
  "Toxic Bass": { rarity: "Uncommon", price: 50, min: 0.5, max: 3 },
  "Sludge Eel": { rarity: "Rare", price: 180, min: 1, max: 5 },
  "Radioactive Carp": { rarity: "Rare", price: 220, min: 1, max: 6 },
  "Sewer Guppy": { rarity: "Common", price: 12, min: 0.1, max: 0.6 },
  "Acid Shark": { rarity: "Epic", price: 900, min: 4, max: 20 },
  "Waste Crab": { rarity: "Uncommon", price: 45, min: 0.3, max: 2 },
  "Toxic Leviathan": { rarity: "Mythic", price: 15000, min: 20, max: 90 },
  "Cloud Koi": { rarity: "Uncommon", price: 70, min: 0.5, max: 2.5 },
  "Storm Ray": { rarity: "Epic", price: 650, min: 3, max: 15 },
  "Sky Bass": { rarity: "Common", price: 22, min: 0.4, max: 2 },
  "Thunder Eel": { rarity: "Rare", price: 250, min: 1, max: 7 },
  "Wind Trout": { rarity: "Common", price: 28, min: 0.5, max: 2 },
  "Balloon Fish": { rarity: "Rare", price: 160, min: 0.8, max: 4 },
  "Angel Fish": { rarity: "Epic", price: 800, min: 2, max: 10 },
  "Sky Whale": { rarity: "Mythic", price: 20000, min: 30, max: 150 },
  "Anglerfish": { rarity: "Rare", price: 300, min: 1, max: 6 },
  "Blobfish": { rarity: "Uncommon", price: 60, min: 0.5, max: 3 },
  "Giant Squid": { rarity: "Epic", price: 1000, min: 5, max: 30 },
  "Abyss Leviathan": { rarity: "Mythic", price: 25000, min: 30, max: 200 },
  "Void Kraken": { rarity: "Mythic", price: 30000, min: 40, max: 250 },
  "Deep Sea Dragon": { rarity: "Legendary", price: 5000, min: 10, max: 60 },
  "Ghost Shark": { rarity: "Legendary", price: 4000, min: 8, max: 40 },
  "God Fish": { rarity: "God", price: 100000, min: 50, max: 500 }
};

const MUTATIONS = [
  { name: "Golden", emoji: "🌟", chance: 0.08, priceMult: 2, weightMult: 1.1 },
  { name: "Diamond", emoji: "💎", chance: 0.04, priceMult: 4, weightMult: 1.2 },
  { name: "Albino", emoji: "👻", chance: 0.07, priceMult: 1.8, weightMult: 0.9 },
  { name: "Toxic", emoji: "☣️", chance: 0.06, priceMult: 2.5, weightMult: 1.1 },
  { name: "Frozen", emoji: "❄️", chance: 0.06, priceMult: 2.2, weightMult: 1.15 },
  { name: "Lava", emoji: "🌋", chance: 0.05, priceMult: 3, weightMult: 1.2 },
  { name: "Void", emoji: "🕳️", chance: 0.02, priceMult: 8, weightMult: 1.3 },
  { name: "Cosmic", emoji: "🌌", chance: 0.015, priceMult: 10, weightMult: 1.4 },
  { name: "Mutated", emoji: "🧬", chance: 0.09, priceMult: 1.5, weightMult: 1.25 },
  { name: "Giant", emoji: "🦍", chance: 0.05, priceMult: 1.5, weightMult: 2 },
  { name: "Tiny", emoji: "🐛", chance: 0.05, priceMult: 1.2, weightMult: 0.3 },
  { name: "Rainbow", emoji: "🌈", chance: 0.01, priceMult: 15, weightMult: 1.5 }
];

function getRandomFish(location, rod){
  const pool=LOCATIONS[location]||LOCATIONS.lake;
  const fishName=pool[Math.floor(Math.random()*pool.length)];
  const base=FISH_DATA[fishName];
  let w=(Math.random()*(base.max-base.min)+base.min);
  let p=base.price;
  let muts=[];
  MUTATIONS.forEach(m=>{
    let c=m.chance;
    if(rod&&rod.includes('Mythic')) c*=1.5;
    if(Math.random()<c){ muts.push(m); p*=m.priceMult; w*=m.weightMult; }
  });
  let final=muts.length?muts.map(m=>m.name).join(' ')+' '+fishName:fishName;
  return { name:final, baseName:fishName, mutations:muts, rarity:base.rarity, weight:parseFloat(w.toFixed(2)), price:Math.floor(p*(w/base.min)), location };
}

async function start(){
  const { state, saveCreds } = await useMultiFileAuthState("auth_info");
  const sock = makeWASocket({ auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, logger) }, logger, browser: ["Fishing Bot","Chrome","1"] });
  sock.ev.on("creds.update", saveCreds);
  sock.ev.on("connection.update", u=>{
    if(u.qr){ latestQR = u.qr; botStatus = "QR READY - SCAN NOW"; qrcode.generate(u.qr,{small:true}); console.log("QR ON DOMAIN READY"); }
    if(u.connection==="open"){ latestQR = null; botStatus = "✅ BOT CONNECTED!"; console.log("✅ BOT READY"); }
    if(u.connection==="close"){ botStatus = "Reconnecting..."; start(); }
  });
  sock.ev.on("messages.upsert", async ({messages})=>{
    for(const m of messages){
      if(!m.message) continue;
      const jid=m.key.remoteJid; const sender=m.key.participant||jid;
      const text=(m.message.conversation||m.message.extendedTextMessage?.text||"").trim();
      if(!text) continue;
      const lower=text.toLowerCase(); const user=getUser(sender);
      if(lower==="!fish"){
        const fish=getRandomFish(user.location,user.currentRod);
        user.inventory.push(fish); user.totalCaught++; if(fish.weight>user.heaviest) user.heaviest=fish.weight; saveDB();
        const mutText=fish.mutations.length?`\n🧬 ${fish.mutations.map(m=>`${m.emoji} ${m.name}`).join(' + ')}`:'';
        await sock.sendMessage(jid,{text:`🎣 Caught *${fish.name}*!\n📍 ${fish.location} | ${fish.rarity}\n⚖️ ${fish.weight}kg 💰 $${fish.price}${mutText}`});
      }
      if(lower==="!meme"){
        const imgs=fs.existsSync(MEME_IMG)?fs.readdirSync(MEME_IMG).filter(f=>/\.(jpg|png|webp)$/i.test(f)):[];
        if(imgs.length) await sock.sendMessage(jid,{image: fs.readFileSync(path.join(MEME_IMG, imgs[Math.floor(Math.random()*imgs.length)]))});
      }
    }
  });
}
start();
