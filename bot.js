const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const fs = require('fs');

const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: { args: ['--no-sandbox'] }
});

let balances = {};
try { balances = JSON.parse(fs.readFileSync('balances.json')); } catch(e) { balances = {}; }
function getBal(id) { if(balances[id]===undefined) balances[id]=100; return balances[id]; }
function saveBal() { fs.writeFileSync('balances.json', JSON.stringify(balances)); }

client.on('qr', qr => qrcode.generate(qr, {small: true}));
client.on('ready', () => console.log('READY! BETS FIXED!'));

client.on('message', async msg => {
    try {
        const raw = msg.body.trim();
        if(!raw.startsWith('!')) return;
        const parts = raw.toLowerCase().split(/\s+/); // splits by any space
        const cmd = parts[0];
        const userId = msg.author || msg.from;
        let bal = getBal(userId);

        console.log(`Command: ${cmd} Arg: ${parts[1]} User: ${userId} Bal: ${bal}`);

        if(cmd === '!balance') {
            await msg.reply(`BALANCE: ${bal} coins`);
            return;
        }
        if(cmd === '!daily') {
            bal += 50; balances[userId]=bal; saveBal();
            await msg.reply(`DAILY +50! NOW ${bal}`);
            return;
        }
        if(cmd === '!slots') {
            let bet = 10;
            if(parts[1]) {
                bet = parseInt(parts[1].replace(/[^0-9]/g, '')); // removes extra chars
                if(isNaN(bet) || bet <= 0) {
                    await msg.reply(`❌ WRONG BET! Use like:!slots 100`);
                    return;
                }
            }
            if(bal < bet) {
                await msg.reply(`❌ NOT ENOUGH! You have ${bal}, you tried to bet ${bet}`);
                return;
            }

            bal -= bet;
            const e = ['🍒','🍋','🍇','💎','7️⃣','🍀'];
            const a = e[Math.floor(Math.random()*6)];
            const b = e[Math.floor(Math.random()*6)];
            const c = e[Math.floor(Math.random()*6)];

            let win = 0; let result = 'LOSE';
            if(a===b && b===c){ win = bet * 10; result = `JACKPOT!!! WIN ${win}!!!`; }
            else if(a===b || b===c || a===c){ win = Math.floor(bet * 2.5); result = `WIN ${win}!`; }

            bal += win; balances[userId]=bal; saveBal();
            await msg.reply(`SLOT RESULT: ${a} ${b} ${c}\n${result}\nBet: ${bet} | Won: ${win}\nYour new balance: ${bal}`);
            return;
        }

        // Wrong command
        await msg.reply(`❌ WRONG WORD! "${cmd}" not found!\nValid:!balance,!daily,!slots,!slots 100`);

    } catch(err) {
        console.log('ERROR:', err);
    }
});
client.initialize();