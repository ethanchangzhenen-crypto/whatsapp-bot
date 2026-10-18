const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });
const db = require('quick.db');

const TOKEN = process.env.TOKEN;
const PREFIX = "!";

const challenges = {
  monday: { name: "Gambling", goal: 20, unit: "gambles", reward: "$2000" },
  tuesday: { name: "Farm Easy", goal: 10000, unit: "$ farmed", reward: "2x Farm" },
  wednesday: { name: "Farm Hard", goal: 25000, unit: "$ farmed", reward: "$5000" },
  thursday: { name: "Pet Care", goal: 100, unit: "% happiness", reward: "Pet EXP" },
  friday: { name: "Fishing Frenzy", goal: 200, unit: "fish", reward: "$3000" },
  saturday: { name: "GC Hunt", goal: 150, unit: "monsters", reward: "500 EXP EACH", shared: true },
  sunday: { name: "GC Race Day", goal: 5, unit: "races", reward: "RESET TONIGHT", shared: true }
};

function getToday(){const d=['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];return d[new Date().getDay()];}
function makeBar(c,g){let p=Math.min(Math.floor(c/g*100),100);let f=Math.floor(p/10);return `[${"█".repeat(f)}${"░".repeat(10-f)}] ${p}%`;}
function footer(){let day=getToday();let Day=day.charAt(0).toUpperCase()+day.slice(1);return `\n\nRemember to do your ${Day} challenge! Use !challenge to see it!`;}
function getLevelBoost(l){return 1+(l*0.15);}

client.on('ready',()=>console.log(`Logged as ${client.user.tag}`));

client.on('messageCreate', async message => {
  if(message.author.bot) return;
  if(!message.content.startsWith(PREFIX)) return;
  const args=message.content.slice(PREFIX.length).trim().split(/ +/);
  const command=args.shift().toLowerCase();
  const userId=message.author.id;
  const guildId=message.guild.id;
  let balance=await db.get(`money_${userId}`)||1000;
  let level=await db.get(`level_${userId}`)||1;
  let exp=await db.get(`exp_${userId}`)||0;
  let today=getToday();

  // !MENU
  if(command==='menu'||command==='help'){
    let prog=await db.get(`challenge_${guildId}_${today}`)||0;
    let personal=await db.get(`challenge_${guildId}_${userId}_${today}`)||0;
    let useProg=challenges[today].shared?prog:personal;
    let bar=makeBar(useProg,challenges[today].goal);
    let embed=new EmbedBuilder().setTitle("💰 ECONOMY RPG - FULL MENU").setDescription(`
📅 **TODAY: ${today.toUpperCase()} - ${challenges[today].name}** ${bar} ${useProg}/${challenges[today].goal}

🎰 Gambling: !cf, !slots, !dice, !gamble
🌾 Farming: !farm, !crops, !sell
🐾 Pet: !pet, !pet feed, !pet play
🎣 Fishing: !fish, !fish sell
👹 Hunt: !hunt (LVL1-10 = Money % Boost)
🏠 Property: !properties, !buy house
📈 Stocks: !stocks, !stocks buy
🏁 Race: !race
📱 QR: !qr <text/link>

💵 Balance: $${balance} | LVL: ${level} (${getLevelBoost(level).toFixed(1)}x)
`).setColor("Gold");
    return message.reply({embeds:[embed]}).then(()=>message.channel.send(footer()));
  }

  // !CHALLENGE
  if(command==='challenge'){
    let prog=await db.get(`challenge_${guildId}_${today}`)||0;
    let personal=await db.get(`challenge_${guildId}_${userId}_${today}`)||0;
    let chal=challenges[today];
    let useProg=chal.shared?prog:personal;
    let bar=makeBar(useProg,chal.goal);
    return message.reply(`📅 **${today.toUpperCase()} CHALLENGE: ${chal.name.toUpperCase()}**
Goal: ${chal.goal} ${chal.unit}
Progress: ${useProg}/${chal.goal}
${bar}
Reward: ${chal.reward}`+footer());
  }

  // !BALANCE
  if(command==='balance'||command==='bal'){
    return message.reply(`💵 $${balance} | LVL ${level} | EXP ${exp}/1000 | Boost ${getLevelBoost(level)}x`+footer());
  }

  // !LEVEL
  if(command==='level'){
    return message.reply(`📈 LVL ${level} EXP ${exp}/1000 ${makeBar(exp,1000)} Boost ${getLevelBoost(level)}x`+footer());
  }

  // !QR - NEW
  if(command==='qr'){
    let text=args.join(" ");
    if(!text) return message.reply(`📱 Use: !qr <text or link>\nExample: !qr https://discord.gg/yourserver`+footer());
    let qrUrl=`https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(text)}`;
    let embed=new EmbedBuilder().setTitle("📱 QR CODE").setDescription(`Link: ${text}\nScan to open!`).setImage(qrUrl).setColor("Blue");
    return message.reply({embeds:[embed]}).then(()=>message.channel.send(footer()));
  }

  // !CF
  if(command==='cf'){
    let choice=args[0]; let bet=parseInt(args[1])||100;
    if(balance<bet) return message.reply(`No money!`+footer());
    let result=Math.random()>0.5?"heads":"tails";
    if(choice===result){let win=Math.floor(bet*getLevelBoost(level));db.add(`money_${userId}`,win);db.add(`challenge_${guildId}_${today}`,1);db.add(`challenge_${guildId}_${userId}_${today}`,1);return message.reply(`🪙 ${result.toUpperCase()} WIN +$${win}`+footer());}
    else{db.subtract(`money_${userId}`,bet);return message.reply(`🪙 ${result.toUpperCase()} LOSE -$${bet}`+footer());}
  }

  // !SLOTS
  if(command==='slots'){
    let bet=parseInt(args[0])||100;
    if(balance<bet) return message.reply(`No money!`+footer());
    let slots=["🍒","🍋","💎","7️⃣","🍀"];
    let s1=slots[Math.floor(Math.random()*slots.length)];
    let s2=slots[Math.floor(Math.random()*slots.length)];
    let s3=slots[Math.floor(Math.random()*slots.length)];
    if(s1===s2&&s2===s3){let win=bet*5*getLevelBoost(level);db.add(`money_${userId}`,Math.floor(win));db.add(`challenge_${guildId}_${today}`,1);return message.reply(`🎰 [ ${s1} | ${s2} | ${s3} ] JACKPOT +$${Math.floor(win)}`+footer());}
    else{db.subtract(`money_${userId}`,bet);return message.reply(`🎰 [ ${s1} | ${s2} | ${s3} ] LOSE -$${bet}`+footer());}
  }

  // !DICE
  if(command==='dice'){
    let guess=parseInt(args[0]); let bet=parseInt(args[1])||100;
    let roll=Math.floor(Math.random()*6)+1;
    if(guess===roll){let win=bet*3;db.add(`money_${userId}`,win);return message.reply(`🎲 Rolled ${roll}! WIN +$${win}`+footer());}
    else{db.subtract(`money_${userId}`,bet);return message.reply(`🎲 Rolled ${roll}! LOSE -$${bet}`+footer());}
  }

  // !FARM / CROPS
  if(command==='farm'||command==='crops'){
    if(args[0]==='plant'){let type=args[1]||'wheat';db.set(`crop_${userId}`,{type,time:Date.now()});return message.reply(`🌱 Planted ${type}!`+footer());}
    let earned=Math.floor(250*getLevelBoost(level));db.add(`money_${userId}`,earned);db.add(`challenge_${guildId}_${today}`,earned);db.add(`challenge_${guildId}_${userId}_${today}`,earned);
    return message.reply(`🌾 Farmed +$${earned}`+footer());
  }

  // !PET
  if(command==='pet'){
    let happy=await db.get(`pet_happy_${userId}`)||100;
    if(args[0]==='feed'){db.set(`pet_happy_${userId}`,Math.min(100,happy+20));return message.reply(`🐶 Fed! ${Math.min(100,happy+20)}%`+footer());}
    if(args[0]==='play'){db.set(`pet_happy_${userId}`,Math.min(100,happy+15));return message.reply(`🐶 Played! ${Math.min(100,happy+15)}%`+footer());}
    return message.reply(`🐾 Pet: ${happy}% Happy`+footer());
  }

  // !FISH
  if(command==='fish'){
    if(args[0]==='sell'){let fish=await db.get(`fish_${userId}`)||0;let sell=fish*50;db.set(`fish_${userId}`,0);db.add(`money_${userId}`,sell);return message.reply(`🎣 Sold ${fish} fish $${sell}`+footer());}
    db.add(`fish_${userId}`,1);db.add(`challenge_${guildId}_${today}`,1);db.add(`challenge_${guildId}_${userId}_${today}`,1);
    let fishCount=await db.get(`fish_${userId}`)||1;
    return message.reply(`🎣 Caught! Total: ${fishCount} ${makeBar(fishCount,challenges[today].goal)}`+footer());
  }

  // !HUNT
  if(command==='hunt'){
    let m=["Goblin","Orc","Dragon","Slime"][Math.floor(Math.random()*4)];
    let earn=Math.floor((100+Math.random()*200)*getLevelBoost(level));
    db.add(`money_${userId}`,earn);db.add(`exp_${userId}`,50);db.add(`challenge_${guildId}_${today}`,1);db.add(`challenge_${guildId}_${userId}_${today}`,1);
    let newExp=await db.get(`exp_${userId}`);
    if(newExp>=1000&&level<10){db.add(`level_${userId}`,1);db.set(`exp_${userId}`,0);return message.reply(`👹 Killed ${m}! +$${earn} LEVEL UP! LVL${level+1}`+footer());}
    return message.reply(`👹 Killed ${m}! +$${earn}`+footer());
  }

  // !PROPERTIES
  if(command==='properties'||command==='buy'){
    let props={house:10000,mansion:50000,hotel:100000};
    if(command==='buy'){let type=args[0];if(!props[type]) return message.reply(`Houses: house $10k mansion $50k hotel $100k`+footer());if(balance<props[type]) return message.reply(`Need $${props[type]}`+footer());db.subtract(`money_${userId}`,props[type]);db.add(`prop_${userId}_${type}`,1);return message.reply(`🏠 Bought ${type}!`+footer());}
    return message.reply(`🏠 Properties: House $10k Mansion $50k Hotel $100k !buy <type>`+footer());
  }

  // !STOCKS
  if(command==='stocks'){
    let stocks={TSLA:200,AAPL:150,BTC:500};
    if(args[0]==='buy'){let sym=args[1]?.toUpperCase();let amt=parseInt(args[2])||1;let cost=(stocks[sym]||100)*amt;if(balance<cost) return message.reply(`Need $${cost}`+footer());db.subtract(`money_${userId}`,cost);db.add(`stock_${userId}_${sym}`,amt);return message.reply(`📈 Bought ${amt}x ${sym} $${cost}`+footer());}
    return message.reply(`📈 Stocks TSLA $200 AAPL $150 BTC $500 !stocks buy <sym> <amt>`+footer());
  }

  // !RACE
  if(command==='race'){
    db.add(`challenge_${guildId}_${today}`,1);db.add(`challenge_${guildId}_${userId}_${today}`,1);
    let gcProg=await db.get(`challenge_${guildId}_${today}`)||1;
    return message.reply(`🏁 Race done! GC ${gcProg}/5 ${makeBar(gcProg,5)}`+footer());
  }
});

client.login(TOKEN);
