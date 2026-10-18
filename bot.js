const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });
const db = require('quick.db');

// ===== CONFIG =====
const TOKEN = process.env.TOKEN;
const PREFIX = "!";

// ===== CHALLENGE SYSTEM =====
const challenges = {
  monday: { name: "Gambling", goal: 20, unit: "gambles", reward: "$2000" },
  tuesday: { name: "Farm Easy", goal: 10000, unit: "$ farmed", reward: "2x Farm" },
  wednesday: { name: "Farm Hard", goal: 25000, unit: "$ farmed", reward: "$5000" },
  thursday: { name: "Pet Care", goal: 100, unit: "% happiness", reward: "Pet EXP" },
  friday: { name: "Fishing Frenzy", goal: 200, unit: "fish (individual)", reward: "$3000" },
  saturday: { name: "GC Hunt", goal: 150, unit: "monsters (GC Shared)", reward: "500 EXP EACH", shared: true },
  sunday: { name: "GC Race Day", goal: 5, unit: "races (GC Shared)", reward: "RESET TONIGHT", shared: true }
};

function getToday() {
  const days = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
  return days[new Date().getDay()];
}
function makeBar(current, goal) {
  let percent = Math.min(Math.floor((current / goal) * 100), 100);
  let filled = Math.floor(percent / 10);
  let empty = 10 - filled;
  return `[${"█".repeat(filled)}${"░".repeat(empty)}] ${percent}%`;
}
function footer() {
  let day = getToday();
  let DayName = day.charAt(0).toUpperCase() + day.slice(1);
  return `\n\nRemember to do your ${DayName} challenge! Use !challenge to see it!`;
}
function getLevelBoost(level) {
  return 1 + (level * 0.15); // LVL1 = 15% boost, LVL10 = 150% boost
}

// ===== BOT READY =====
client.on('ready', () => {
  console.log(`Logged as ${client.user.tag}`);
});

// ===== MESSAGE HANDLER =====
client.on('messageCreate', async message => {
  if (message.author.bot) return;
  if (!message.content.startsWith(PREFIX)) return;

  const args = message.content.slice(PREFIX.length).trim().split(/ +/);
  const command = args.shift().toLowerCase();
  const userId = message.author.id;
  const guildId = message.guild.id;

  let balance = await db.get(`money_${userId}`) || 1000;
  let level = await db.get(`level_${userId}`) || 1;
  let exp = await db.get(`exp_${userId}`) || 0;
  let today = getToday();

  // ===== !MENU / !HELP =====
  if (command === 'menu' || command === 'help') {
    let prog = await db.get(`challenge_${guildId}_${today}`) || 0;
    let personalProg = await db.get(`challenge_${guildId}_${userId}_${today}`) || 0;
    let useProg = challenges[today].shared ? prog : personalProg;
    let bar = makeBar(useProg, challenges[today].goal);

    let embed = new EmbedBuilder()
      .setTitle("💰 ECONOMY RPG - FULL MENU")
      .setDescription(`
📅 **TODAY: ${today.toUpperCase()} - ${challenges[today].name}**
${bar} ${useProg}/${challenges[today].goal} ${challenges[today].unit}
Use !challenge for full details

**🎰 GAMBLING:**
!cf <heads/tails> <bet> - Coinflip
!slots <bet> - Slot machine
!dice <1-6> <bet> - Dice roll

**🌾 FARMING:**
!farm - Farm crops ($250)
!crops - Check crops growth
!crops plant <type> - Plant
!sell crops - Sell all crops

**🐾 PET SYSTEM:**
!pet - View pet status
!pet feed - Feed pet (+20% happy)
!pet play - Play with pet (+15% happy)
!pet buy <name> - Buy pet

**🎣 FISHING:**
!fish - Fish for fish
!fish sell - Sell all fish
!fish inv - Fish inventory

**👹 HUNTING:**
!hunt - Hunt monsters (EXP + Money)
!level - Check LVL1-10 & Boost
!leaderboard - Top hunters

**🏠 PROPERTIES:**
!properties - View all properties
!buy <house/mansion/hotel> - Buy property
!properties collect - Collect rent

**📈 STOCKS:**
!stocks - View stock market
!stocks buy <symbol> <amount>
!stocks sell <symbol> <amount>
!stocks portfolio - Your stocks

**🏁 RACE (SUNDAY):**
!race - Start race
!race join - Join GC race

**💵 OTHER:**
!balance - Check money
!daily - Daily reward
!inventory - All items
!challenge - Daily challenge

Your Balance: $${balance} | LVL: ${level} (${getLevelBoost(level).toFixed(1)}x boost)
      `)
      .setColor("Gold");
    return message.reply({ embeds: [embed] }).then(m => {
      m.reply(footer());
    }).catch(() => message.reply(`Menu loaded` + footer()));
  }

  // ===== !CHALLENGE REAL TIME =====
  if (command === 'challenge') {
    let prog = await db.get(`challenge_${guildId}_${today}`) || 0;
    let personalProg = await db.get(`challenge_${guildId}_${userId}_${today}`) || 0;
    let chal = challenges[today];
    let useProg = chal.shared ? prog : personalProg;
    let bar = makeBar(useProg, chal.goal);
    let need = chal.goal - useProg;

    return message.reply(`📅 **${today.toUpperCase()} CHALLENGE: ${chal.name.toUpperCase()}**
━━━━━━━━━━━━━━━
Goal: ${chal.goal} ${chal.unit}
Progress: ${useProg} / ${chal.goal}
${bar}

${need > 0 ? `Need ${need} more! Keep grinding!` : `✅ COMPLETED!`}

**Reward:** ${chal.reward}
**How:** Use ${chal.shared ? 'GC commands together' : 'your commands'}
LVL1-8 Progress: ${bar}

${chal.shared ? `GC TOTAL: ${prog}/150` : `Personal: ${personalProg}/${chal.goal}`}` + footer());
  }

  // ===== !BALANCE =====
  if (command === 'balance' || command === 'bal') {
    let boost = getLevelBoost(level);
    return message.reply(`💵 **Balance:** $${balance}\n📊 **LVL:** ${level} | Boost: ${boost}x more money\n⭐ EXP: ${exp}/1000` + footer());
  }

  // ===== !LEVEL =====
  if (command === 'level') {
    let boost = getLevelBoost(level);
    let bar = makeBar(exp, 1000);
    return message.reply(`📈 **Level System LVL1-10**
Your Level: ${level}
EXP: ${exp}/1000 ${bar}
Money Boost: ${boost}x ( +${Math.floor((boost-1)*100)}% )
LVL10 = 2.5x Money!` + footer());
  }

  // ===== !CF COINFLIP =====
  if (command === 'cf') {
    let choice = args[0]; let bet = parseInt(args[1]) || 100;
    if (balance < bet) return message.reply(`No money!` + footer());
    let result = Math.random() > 0.5 ? "heads" : "tails";
    if (choice === result) {
      let win = Math.floor(bet * getLevelBoost(level));
      db.add(`money_${userId}`, win);
      db.add(`challenge_${guildId}_${today}`, 1);
      db.add(`challenge_${guildId}_${userId}_${today}`, 1);
      return message.reply(`🪙 CF: ${result.toUpperCase()}! You WIN +$${win}` + footer());
    } else {
      db.subtract(`money_${userId}`, bet);
      return message.reply(`🪙 CF: ${result.toUpperCase()}! You LOSE -$${bet}` + footer());
    }
  }

  // ===== !SLOTS =====
  if (command === 'slots') {
    let bet = parseInt(args[0]) || 100;
    if (balance < bet) return message.reply(`No money!` + footer());
    let slots = ["🍒","🍋","💎","7️⃣","🍀"];
    let s1 = slots[Math.floor(Math.random()*slots.length)];
    let s2 = slots[Math.floor(Math.random()*slots.length)];
    let s3 = slots[Math.floor(Math.random()*slots.length)];
    if (s1 === s2 && s2 === s3) {
      let win = bet * 5 * getLevelBoost(level);
      db.add(`money_${userId}`, win);
      db.add(`challenge_${guildId}_${today}`, 1);
      db.add(`challenge_${guildId}_${userId}_${today}`, 1);
      return message.reply(`🎰 [ ${s1} | ${s2} | ${s3} ] JACKPOT! +$${Math.floor(win)}` + footer());
    } else {
      db.subtract(`money_${userId}`, bet);
      return message.reply(`🎰 [ ${s1} | ${s2} | ${s3} ] LOSE -$${bet}` + footer());
    }
  }

  // ===== !DICE =====
  if (command === 'dice') {
    let guess = parseInt(args[0]); let bet = parseInt(args[1]) || 100;
    let roll = Math.floor(Math.random()*6)+1;
    if (guess === roll) {
      let win = bet * 3;
      db.add(`money_${userId}`, win);
      return message.reply(`🎲 Rolled ${roll}! You guessed ${guess} WIN +$${win}` + footer());
    } else {
      db.subtract(`money_${userId}`, bet);
      return message.reply(`🎲 Rolled ${roll}! You guessed ${guess} LOSE -$${bet}` + footer());
    }
  }

  // ===== !FARM / CROPS =====
  if (command === 'farm' || command === 'crops') {
    if (args[0] === 'plant') {
      let type = args[1] || 'wheat';
      db.set(`crop_${userId}`, { type, time: Date.now() });
      return message.reply(`🌱 Planted ${type}! Wait 5 mins` + footer());
    }
    let earned = Math.floor(250 * getLevelBoost(level));
    db.add(`money_${userId}`, earned);
    db.add(`challenge_${guildId}_${today}`, earned);
    db.add(`challenge_${guildId}_${userId}_${today}`, earned);
    return message.reply(`🌾 Farmed +$${earned} | Boost: ${getLevelBoost(level)}x` + footer());
  }

  // ===== !PET =====
  if (command === 'pet') {
    let happy = await db.get(`pet_happy_${userId}`) || 100;
    if (args[0] === 'feed') {
      db.set(`pet_happy_${userId}`, Math.min(100, happy+20));
      return message.reply(`🐶 Fed pet! Happiness: ${Math.min(100, happy+20)}%` + footer());
    }
    if (args[0] === 'play') {
      db.set(`pet_happy_${userId}`, Math.min(100, happy+15));
      return message.reply(`🐶 Played! Happiness: ${Math.min(100, happy+15)}%` + footer());
    }
    return message.reply(`🐾 Pet Status: ${happy}% Happy\n!pet feed / !pet play to keep 100%` + footer());
  }

  // ===== !FISH =====
  if (command === 'fish') {
    if (args[0] === 'sell') {
      let fish = await db.get(`fish_${userId}`) || 0;
      let sell = fish * 50;
      db.set(`fish_${userId}`, 0);
      db.add(`money_${userId}`, sell);
      return message.reply(`🎣 Sold ${fish} fish for $${sell}` + footer());
    }
    db.add(`fish_${userId}`, 1);
    db.add(`challenge_${guildId}_${today}`, 1);
    db.add(`challenge_${guildId}_${userId}_${today}`, 1);
    let fishCount = await db.get(`fish_${userId}`) || 1;
    let bar = challenges[today].goal ? makeBar(fishCount, challenges[today].goal) : '';
    return message.reply(`🎣 Caught 1 fish! Total: ${fishCount} ${today === 'friday' ? bar : ''}` + footer());
  }

  // ===== !HUNT =====
  if (command === 'hunt') {
    let monsters = ["Goblin","Orc","Dragon","Slime"];
    let m = monsters[Math.floor(Math.random()*monsters.length)];
    let earn = Math.floor((100 + Math.random()*200) * getLevelBoost(level));
    let expGain = 50;
    db.add(`money_${userId}`, earn);
    db.add(`exp_${userId}`, expGain);
    db.add(`challenge_${guildId}_${today}`, 1);
    db.add(`challenge_${guildId}_${userId}_${today}`, 1);
    
    // Level up check
    let newExp = await db.get(`exp_${userId}`);
    if (newExp >= 1000 && level < 10) {
      db.add(`level_${userId}`, 1);
      db.set(`exp_${userId}`, 0);
      return message.reply(`👹 Killed ${m}! +$${earn} +${expGain} EXP\n🎉 LEVEL UP! Now LVL${level+1} Boost: ${getLevelBoost(level+1)}x` + footer());
    }
    return message.reply(`👹 Killed ${m}! +$${earn} +${expGain} EXP` + footer());
  }

  // ===== !PROPERTIES =====
  if (command === 'properties' || command === 'buy') {
    let props = { house: 10000, mansion: 50000, hotel: 100000 };
    if (command === 'buy') {
      let type = args[0];
      if (!props[type]) return message.reply(`Houses: house $10k, mansion $50k, hotel $100k` + footer());
      if (balance < props[type]) return message.reply(`Need $${props[type]}` + footer());
      db.subtract(`money_${userId}`, props[type]);
      db.add(`prop_${userId}_${type}`, 1);
      return message.reply(`🏠 Bought ${type} for $${props[type]}!` + footer());
    }
    return message.reply(`🏠 **Properties Shop**
House - $10,000 - $500/day rent
Mansion - $50,000 - $3000/day rent
Hotel - $100,000 - $7000/day rent
Use !buy <type> | !properties collect` + footer());
  }

  // ===== !STOCKS =====
  if (command === 'stocks') {
    let stocks = { TSLA: 200, AAPL: 150, BTC: 500 };
    if (args[0] === 'buy') {
      let sym = args[1]?.toUpperCase(); let amt = parseInt(args[2]) || 1;
      let cost = (stocks[sym] || 100) * amt;
      if (balance < cost) return message.reply(`Need $${cost}` + footer());
      db.subtract(`money_${userId}`, cost);
      db.add(`stock_${userId}_${sym}`, amt);
      return message.reply(`📈 Bought ${amt}x ${sym} for $${cost}` + footer());
    }
    return message.reply(`📈 **Stocks Market**
TSLA: $200
AAPL: $150
BTC: $500
Use !stocks buy <symbol> <amount>
!stocks portfolio` + footer());
  }

  // ===== !RACE =====
  if (command === 'race') {
    db.add(`challenge_${guildId}_${today}`, 1);
    db.add(`challenge_${guildId}_${userId}_${today}`, 1);
    let gcProg = await db.get(`challenge_${guildId}_${today}`) || 1;
    return message.reply(`🏁 Race finished! GC Races: ${gcProg}/5 ${makeBar(gcProg,5)}` + footer());
  }

  // ===== SUNDAY RESET CHECK =====
  if (today === 'sunday') {
    let hour = new Date().getHours();
    if (hour === 23) {
      // Reset logic - would need cron, here manual
    }
  }
});

client.login(TOKEN);
