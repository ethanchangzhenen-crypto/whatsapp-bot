sock.ev.on('messages.upsert', async m=>{
    try{
      const msg=m.messages[0]
      console.log('--- NEW MESSAGE ---')
      console.log('fromMe:', msg.key.fromMe, 'jid:', msg.key.remoteJid)
      console.log('message keys:', Object.keys(msg.message || {}))
      const text = msg.message?.conversation || msg.message?.extendedTextMessage?.text || msg.message?.imageMessage?.caption || JSON.stringify(msg.message).slice(0,200)
      console.log('TEXT CONTENT:', JSON.stringify(text))
      if(!text) return
      if(msg.key.fromMe) return
      const t=text.trim().toLowerCase()
      if(t.includes('bal') || t.includes('menu') || t.includes('check')){
        console.log('DETECTED BAL/MENU/CHECK')
        await sock.sendMessage(msg.key.remoteJid, {text:`Got your message: ${text}`})
      }
    }catch(e){ console.log('ERROR:', e) }
  })
