const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const fs = require('fs');
const path = require('path');
const qrcode = require('qrcode-terminal');

const client = new Client({ 
  authStrategy: new LocalAuth(), 
  puppeteer: { args: ['--no-sandbox', '--disable-setuid-sandbox'] } 
});
client.on('qr', qr => qrcode.generate(qr, { small: true }));
client.on('ready', () => console.log('BOT READY - MEME + FISHING V9 + DEBATE'));

const DB_FILE = './fishing_db.json';
let db = { users: {} };
if (fs.existsSync(DB_FILE)) { try { db = JSON.parse(fs.readFileSync(DB_FILE)); } catch(e){} }
function saveDB() { fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2)); }
function getUser(id) {
  if (!db.users[id]) {
    db.users[id] = { inventory: [], money: 100, location: 'lake', rods: ['Wooden Rod'], currentRod: 'Wooden Rod', totalCaught: 0, heaviest: 0, level: 1, xp: 0 };
  }
  return db.users[id];
}

const MEME_IMG = './memes/images';
const MEME_VID = './memes/videos';
if (!fs.existsSync(MEME_IMG)) fs.mkdirSync(MEME_IMG, { recursive: true });
if (!fs.existsSync(MEME_VID)) fs.mkdirSync(MEME_VID, { recursive: true });

// ========== FISHING V9 - 64 FISH + STACKABLE MUTATIONS ==========
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

const FISH_DATA = {
  "Minnow":{rarity:"Common", price:5, min:0.1, max:0.5}, "Bluegill":{rarity:"Common", price:10, min:0.2, max:0.8},
  "Largemouth Bass":{rarity:"Uncommon", price:25, min:0.5, max:2}, "Carp":{rarity:"Common", price:15, min:0.8, max:3},
  "Catfish":{rarity:"Uncommon", price:30, min:1, max:4}, "Perch":{rarity:"Common", price:12, min:0.3, max:1},
  "Crappie":{rarity:"Common", price:12, min:0.2, max:1}, "Lake Sturgeon":{rarity:"Rare", price:150, min:3, max:10},
  "Trout":{rarity:"Uncommon", price:30, min:0.5, max:2.5}, "Salmon":{rarity:"Uncommon", price:40, min:1, max:5},
  "Pike":{rarity:"Rare", price:80, min:1, max:6}, "Walleye":{rarity:"Uncommon", price:35, min:0.6, max:3},
  "Smallmouth Bass":{rarity:"Common", price:20, min:0.4, max:2}, "River Eel":{rarity:"Rare", price:90, min:0.5, max:4},
  "Stickleback":{rarity:"Common", price:5, min:0.05, max:0.3}, "River Monster":{rarity:"Epic", price:400, min:5, max:20},
  "Mackerel":{rarity:"Common", price:18, min:0.3, max:1.5}, "Tuna":{rarity:"Rare", price:120, min:2, max:15},
  "Swordfish":{rarity:"Epic", price:600, min:5, max:30}, "Shark":{rarity:"Epic", price:500, min:4, max:25},
  "Clownfish":{rarity:"Common", price:15, min:0.1, max:0.5}, "Barracuda":{rarity:"Rare", price:100, min:1, max:8},
  "Marlin":{rarity:"Epic", price:700, min:6, max:35}, "Ocean Sunfish":{rarity:"Legendary", price:2000, min:10, max:50},
  "Lava Eel":{rarity:"Rare", price:200, min:1, max:5}, "Magma Carp":{rarity:"Uncommon", price:60, min:0.8, max:4},
  "Obsidian Bass":{rarity:"Epic", price:800, min:3, max:15}, "Ash Trout":{rarity:"Common", price:25, min:0.5, max:2},
  "Fire Guppy":{rarity:"Common", price:10, min:0.1, max:0.4}, "Volcano Shark":{rarity:"Legendary", price:3000, min:8, max:40},
  "Cinder Crab":{rarity:"Rare", price:180, min:0.5, max:3}, "Lava Leviathan":{rarity:"Mythic", price:10000, min:20, max:100},
  "Icefish":{rarity:"Common", price:20, min:0.3, max:1.2}, "Frost Minnow":{rarity:"Common", price:8, min:0.1, max:0.5},
  "Snow Trout":{rarity:"Uncommon", price:40, min:0.6, max:3}, "Ice Pike":{rarity:"Rare", price:150, min:2, max:8},
  "Narwhal":{rarity:"Epic", price:600, min:4, max:20}, "Frost Shark":{rarity:"Epic", price:750, min:5, max:25},
  "Glacier Eel":{rarity:"Rare", price:200, min:1, max:6}, "Ice Kraken":{rarity:"Mythic", price:12000, min:25, max:120},
  "Mutant Frog":{rarity:"Common", price:30, min:0.2, max:1}, "Toxic Bass":{rarity:"Uncommon", price:50, min:0.5, max:3},
  "Sludge Eel":{rarity:"Rare", price:180, min:1, max:5}, "Radioactive Carp":{rarity:"Rare", price:220, min:1, max:6},
  "Sewer Guppy":{rarity:"Common", price:12, min:0.1, max:0.6}, "Acid Shark":{rarity:"Epic", price:900, min:4, max:20},
  "Waste Crab":{rarity:"Uncommon", price:45, min:0.3, max:2}, "Toxic Leviathan":{rarity:"Mythic", price:15000, min:20, max:90},
  "Cloud Koi":{rarity:"Uncommon", price:70, min:0.5, max:2.5}, "Storm Ray":{rarity:"Epic", price:650, min:3, max:15},
  "Sky Bass":{rarity:"Common", price:22, min:0.4, max:2}, "Thunder Eel":{rarity:"Rare", price:250, min:1, max:7},
  "Wind Trout":{rarity:"Common", price:28, min:0.5, max:2}, "Balloon Fish":{rarity:"Rare", price:160, min:0.8, max:4},
  "Angel Fish":{rarity:"Epic", price:800, min:2, max:10}, "Sky Whale":{rarity:"Mythic", price:20000, min:30, max:150},
  "Anglerfish":{rarity:"Rare", price:300, min:1, max:6}, "Blobfish":{rarity:"Uncommon", price:60, min:0.5, max:3},
  "Giant Squid":{rarity:"Epic", price:1000, min:5, max:30}, "Abyss Leviathan":{rarity:"Mythic", price:25000, min:30, max:200},
  "Void Kraken":{rarity:"Mythic", price:30000, min:40, max:250}, "Deep Sea Dragon":{rarity:"Legendary", price:5000, min:10, max:60},
  "Ghost Shark":{rarity:"Legendary", price:4000, min:8, max:40}, "God Fish":{rarity:"God", price:100000, min:50, max:500}
};

const MUTATIONS = [
  { name:"Golden", emoji:"🌟", chance:0.08, priceMult:2, weightMult:1.1 },
  { name:"Diamond", emoji:"💎", chance:0.04, priceMult:4, weightMult:1.2 },
  { name:"Albino", emoji:"👻", chance:0.07, priceMult:1.8, weightMult:0.9 },
  { name:"Toxic", emoji:"☣️", chance:0.06, priceMult:2.5, weightMult:1.1 },
  { name:"Frozen", emoji:"❄️", chance:0.06, priceMult:2.2, weightMult:1.15 },
  { name:"Lava", emoji:"🌋", chance:0.05, priceMult:3, weightMult:1.2 },
  { name:"Void", emoji:"🕳️", chance:0.02, priceMult:8, weightMult:1.3 },
  { name:"Cosmic", emoji:"🌌", chance:0.015, priceMult:10, weightMult:1.4 },
  { name:"Mutated", emoji:"🧬", chance:0.09, priceMult:1.5, weightMult:1.25 },
  { name:"Giant", emoji:"🦍", chance:0.05, priceMult:1.5, weightMult:2 },
  { name:"Tiny", emoji:"🐛", chance:0.05, priceMult:1.2, weightMult:0.3 },
  { name:"Rainbow", emoji:"🌈", chance:0.01, priceMult:15, weightMult:1.5 },
];

function getRandomFish(location, userRod) {
  const pool = LOCATIONS[location] || LOCATIONS.lake;
  const fishName = pool[Math.floor(Math.random()*pool.length)];
  const base = FISH_DATA[fishName];
  let weight = (Math.random()*(base.max-base.min)+base.min);
  let price = base.price;
  let muts = [];
  
  MUTATIONS.forEach(m => {
    let c = m.chance;
    if (userRod && userRod.includes('Mythic')) c*=1.5;
    if (Math.random() < c) {
      muts.push(m);
      price *= m.priceMult;
      weight *= m.weightMult;
    }
  });

  let finalName = muts.length ? muts.map(m=>m.name).join(' ') + ' ' + fishName : fishName;
  return {
    name: finalName, baseName: fishName, mutations: muts,
    rarity: base.rarity, weight: parseFloat(weight.toFixed(2)),
    price: Math.floor(price * (weight/base.min)), id: Date.now()+Math.random(),
    location
  };
}

// ========== DEBATE ==========
const DEBATE_SCENARIOS = {
  easy: ["You ate your friend's entire birthday cake and said it was a diet plan","You brought a live goat to school and said it's your emotional support animal","You replaced the office coffee with decaf for 6 months","You yelled 'I AM THE LIZARD KING' in a library","You taught your grandma to say 'skibidi' and now she won't stop"],
  hard: ["You sold friend's limited sneakers to buy 10,000 rubber ducks","You faked sick for 2 weeks to avoid group project","You leaked group chat screenshots to crush","You told everyone friend sleeps with nightlight","You borrowed $500 and spent on gacha"],
  impossible: ["You killed a clown because he looked funny","You burned down McDonald's forgot nuggets","You kidnapped school mascot ransom 5 v-bucks","You erased friend's Minecraft world 4 years","You robbed bank with water gun"]
};
const DEBATE_COUNTERS = {
  easy: ["Lol that's it? Explain better.", "So you think that's valid?"],
  hard: ["That's selfish. What about others?", "That's excuse not reason."],
  impossible: ["You committed CRIME and think okay? Defend MORALITY.", "Justify why you DESERVE to be right."]
};
let activeDebates = {};
function startDebate(chatId, defendantId, difficulty, msg) {
  if (activeDebates[chatId]) return msg.reply(`⚖️ Debate running!\nCrime: ${activeDebates[chatId].scenario}\n!debate_end to end`);
  const pool = DEBATE_SCENARIOS[difficulty];
  const scenario = pool[Math.floor(Math.random()*pool.length)];
  activeDebates[chatId] = { defendantId, difficulty, scenario, startTime: Date.now(), messages: [], chatId };
  msg.reply(`⚖️ *DEBATE ${difficulty.toUpperCase()}*\n\n*ACCUSED:* @${defendantId.split('@')[0]}\n*CRIME:* ${scenario}\n\n@${defendantId.split('@')[0]} You have 2 MINS to justify!\nI am prosecutor.`, { mentions: [defendantId] });
  setTimeout(() => { if (activeDebates[chatId]) endDebate(chatId, msg); }, 120000);
}
async function endDebate(chatId, msg) {
  const d = activeDebates[chatId]; if (!d) return; delete activeDebates[chatId];
  let winChance = d.difficulty==='easy'?0.7:d.difficulty==='hard'?0.4:0.15;
  if (d.messages.length>=3) winChance+=0.2; if (d.messages.length>=5) winChance+=0.1;
  const win = Math.random() < winChance;
  const verdict = win ? `✅ *DEFENDANT WINS!* "${d.scenario}"` : `❌ *PROSECUTION WINS!* "${d.scenario}" Guilty.`;
  return msg.reply(`${verdict}\nDifficulty: ${d.difficulty} | Messages: ${d.messages.length}`);
}

// ========== HANDLER ==========
client.on('message', async msg => {
  try {
    if (msg.fromMe) return;
    const text = msg.body.trim();
    const lower = text.toLowerCase();
    const userId = msg.author || msg.from;
    const user = getUser(userId);

    if (['!help','!menu'].includes(lower)) {
      return msg.reply(`📖 *BOT - 3 GAMES*\n\n*🎣 FISHING V9*\n!fish - Cast (64 fish, 12 stackable mutations)\n!fish_location - Where you are\n!fish_travel lake/river/ocean/volcano/ice/toxic/sky/abyss\n!fish_inventory - Shows mutations 🌟💎🌈\n!fish_sell all\n!fish_stats\n\n*🖼️ MEME*\n!meme - 1 image + 1 video\n\n*⚖️ DEBATE*\n!debate easy/hard/impossible\n!debate @user hard\n!debate_end`);
    }

    // MEME
    if (lower === '!meme') {
      const imgs = fs.existsSync(MEME_IMG) ? fs.readdirSync(MEME_IMG).filter(f=>/\.(jpg|jpeg|png|webp)$/i.test(f)) : [];
      const vids = fs.existsSync(MEME_VID) ? fs.readdirSync(MEME_VID).filter(f=>/\.(mp4|mov|mkv)$/i.test(f)) : [];
      if (imgs.length) {
        const media = MessageMedia.fromFilePath(path.join(MEME_IMG, imgs[Math.floor(Math.random()*imgs.length)]));
        await client.sendMessage(msg.from, media, { sendMediaAsDocument: false });
      }
      if (vids.length) {
        const media = MessageMedia.fromFilePath(path.join(MEME_VID, vids[Math.floor(Math.random()*vids.length)]));
        await client.sendMessage(msg.from, media, { sendMediaAsDocument: false });
      }
      return;
    }

    // FISHING
    if (lower === '!fish') {
      const fish = getRandomFish(user.location, user.currentRod);
      user.inventory.push(fish); user.totalCaught++;
      if (fish.weight > user.heaviest) user.heaviest = fish.weight; saveDB();
      const mutText = fish.mutations.length ? `\n🧬 *MUTATIONS STACKED:* ${fish.mutations.map(m=>`${m.emoji} ${m.name} x${m.priceMult}`).join(' + ')}\n💥 Stack Bonus: ${fish.mutations.length} mutations!` : '';
      return msg.reply(`🎣 Caught *${fish.name}*!\n📍 ${fish.location} | ${FISH_DATA[fish.baseName].rarity}\n⚖️ ${fish.weight}kg\n💰 $${fish.price}${mutText}`);
    }
    if (lower.startsWith('!fish_travel')) {
      const loc = lower.split(' ')[1]; if (!LOCATIONS[loc]) return msg.reply(`Invalid. Locations: ${Object.keys(LOCATIONS).join(', ')}`);
      user.location = loc; saveDB(); return msg.reply(`✈️ Traveled to *${loc.toUpperCase()}*\nFish here: ${LOCATIONS[loc].join(', ')}\n!fish to catch`);
    }
    if (lower === '!fish_location') {
      return msg.reply(`📍 You are at *${user.location}*\nFish here: ${LOCATIONS[user.location].join(', ')}\nAll locations: ${Object.keys(LOCATIONS).join(', ')}\n!fish_travel [name] to move`);
    }
    if (lower === '!fish_inventory' || lower === '!fish_inv') {
      if (!user.inventory.length) return msg.reply('No fish. !fish');
      let out = `🎒 *Inventory ${user.inventory.length} - ${user.location}*\n`;
      user.inventory.slice(-15).forEach(f=>{
        const em = f.mutations.map(m=>m.emoji).join('');
        out+= `${em} ${f.name} ${f.weight}kg $${f.price}\n`;
      });
      return msg.reply(out);
    }
    if (lower.startsWith('!fish_sell')) { 
      const total = user.inventory.reduce((s,f)=>s+f.price,0); 
      user.inventory=[]; 
      user.money+=total; 
      saveDB(); 
      return msg.reply(`Sold all $${total} Total $${user.money}`); 
    }
    if (lower === '!fish_stats') { 
      return msg.reply(`📊 Caught: ${user.totalCaught} | Heaviest: ${user.heaviest}kg | $${user.money} | Location: ${user.location}\n64 fish total, 12 mutations stackable 🌟💎🌈☣️❄️🌋🕳️🌌🧬🦍🐛👻`); 
    }

    // DEBATE
    if (lower.startsWith('!debate')) {
      let diff='hard'; if (lower.includes('easy')) diff='easy'; if (lower.includes('impossible')) diff='impossible';
      if (lower==='!debate_end'){ if (activeDebates[msg.from]) return endDebate(msg.from, msg); else return msg.reply('No debate'); }
      let targetId = msg.mentionedIds?.length ? msg.mentionedIds[0] : userId;
      return startDebate(msg.from, targetId, diff, msg);
    }
    if (activeDebates[msg.from] && activeDebates[msg.from].defendantId===userId) {
      if (text.startsWith('!')) return;
      activeDebates[msg.from].messages.push(text);
      const pool=DEBATE_COUNTERS[activeDebates[msg.from].difficulty];
      return msg.reply(`${pool[Math.floor(Math.random()*pool.length)]} _${Math.floor((120000-(Date.now()-activeDebates[msg.from].startTime))/1000)}s left_`);
    }

  } catch(e){ console.log(e); }
});
client.initialize();
