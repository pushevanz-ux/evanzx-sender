const express = require('express');
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const QRCode = require('qrcode');
const pino = require('pino');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

let sock = null;
let qrString = '';
let isConnected = false;

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState('auth');
  sock = makeWASocket({
    auth: state,
    logger: pino({ level: 'silent' }),
    printQRInTerminal: false,
    browser: ['evanzx-sender', 'Chrome', '1.0']
  });

  sock.ev.on('creds.update', saveCreds);
  sock.ev.on('connection.update', async (u) => {
    const { connection, lastDisconnect, qr } = u;
    if (qr) qrString = qr;
    if (connection === 'open') { isConnected = true; qrString = ''; console.log('CONNECTED!'); }
    if (connection === 'close') {
      isConnected = false;
      const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
      if (shouldReconnect) startBot();
    }
  });
}
startBot();

app.get('/', (req, res) => {
  res.send(`
  <!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1">
  <title>evanzx Sender</title>
  <style>body{background:#111;color:#fff;font-family:sans-serif;padding:16px}input,textarea{width:100%;padding:12px;margin:7px 0;background:#222;color:#fff;border:1px solid #444;border-radius:10px;box-sizing:border-box}button{background:#25D366;padding:14px;width:100%;border:0;border-radius:10px;font-weight:900}img{width:260px;background:#fff;padding:10px;border-radius:12px}</style>
  </head><body>
  <h2>⚡ evanzx SENDER</h2>
  <p>Status: <b id="st">Loading...</b></p>
  <div id="qrbox"></div>
  <input id="nomor" placeholder="62812xxxx">
  <textarea id="pesan" rows="3" placeholder="Pesan..."></textarea>
  <button onclick="kirim()">KIRIM LANGSUNG</button>
  <p id="hasil"></p>
  <script>
  async function cek(){
    const r = await fetch('/status'); const d = await r.json();
    document.getElementById('st').innerText = d.connected ? '✅ CONNECTED - Siap kirim' : '❌ Belum connect - Scan QR di bawah';
    if(!d.connected && d.qr) document.getElementById('qrbox').innerHTML = '<p>Scan pake WA lu:</p><img src="'+d.qr+'">';
    else if(d.connected) document.getElementById('qrbox').innerHTML = '';
  }
  setInterval(cek, 3000); cek();
  async function kirim(){
    const nomor = document.getElementById('nomor').value;
    const pesan = document.getElementById('pesan').value;
    document.getElementById('hasil').innerText = 'Ngirim...';
    const r = await fetch('/send', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({nomor, pesan})});
    const d = await r.json();
    document.getElementById('hasil').innerText = JSON.stringify(d);
    alert(d.success ? 'KEKIRIM!' : 'Gagal: '+d.error);
  }
  </script></body></html>`);
});

app.get('/status', async (req, res) => {
  let qrImg = '';
  if (qrString) qrImg = await QRCode.toDataURL(qrString);
  res.json({ connected: isConnected, qr: qrImg });
});

app.post('/send', async (req, res) => {
  try {
    if (!isConnected) return res.json({ success: false, error: 'Bot belum connect, scan QR dulu' });
    let { nomor, pesan } = req.body;
    nomor = nomor.replace(/[^0-9]/g, '');
    if (nomor.startsWith('0')) nomor = '62' + nomor.slice(1);
    const jid = nomor + '@s.whatsapp.net';
    await sock.sendMessage(jid, { text: pesan });
    res.json({ success: true, to: nomor });
  } catch (e) { res.json({ success: false, error: e.message }); }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Jalan di ' + PORT));
