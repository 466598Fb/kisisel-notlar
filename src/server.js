require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const os = require('os');
const helmet = require('helmet');
const compression = require('compression');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const auth = require('./auth');
const db = require('./database');

const config = {
  port: process.env.PORT || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  allowedOrigins: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',').map(s => s.trim()) : null
};

const app = express();
const server = http.createServer(app);

const corsOptions = {
  origin: config.allowedOrigins || true,
  credentials: true
};

const io = new Server(server, {
  cors: corsOptions,
  pingTimeout: 60000,
  pingInterval: 25000
});

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "blob:"],
      connectSrc: ["'self'", "ws:", "wss:"]
    }
  }
}));
app.use(compression());
app.use(cors(corsOptions));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX) || 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Cok fazla istek. Lutfen biraz bekleyin.' }
});
app.use('/api/', limiter);

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Cok fazla giris denemesi. 15 dakika bekleyin.' }
});

app.use(express.static(path.join(__dirname, '..', 'public')));
app.use('/vendor/quill', express.static(path.join(__dirname, '..', 'node_modules', 'quill', 'dist')));

function authMiddleware(req, res, next) {
  const token = req.headers['authorization']?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Token gerekli' });
  const payload = auth.verifyToken(token);
  if (!payload) return res.status(401).json({ error: 'Gecersiz veya suresi dolmus token' });
  req.user = payload;
  next();
}

function socketAuthMiddleware(socket, next) {
  const token = socket.handshake.auth?.token;
  if (!token) return next(new Error('Token gerekli'));
  const payload = auth.verifyToken(token);
  if (!payload) return next(new Error('Gecersiz token'));
  socket.user = payload;
  next();
}

app.post('/api/login', loginLimiter, async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Kullanici adi ve sifre gerekli' });
  const user = await db.getUserByUsername(username);
  if (!user) return res.status(401).json({ error: 'Kullanici adi veya sifre hatali' });
  const valid = await auth.comparePassword(password, user.password_hash);
  if (!valid) return res.status(401).json({ error: 'Kullanici adi veya sifre hatali' });
  const token = auth.generateToken({ id: user.id, username: user.username });
  res.json({ token, username: user.username });
});

app.get('/api/me', authMiddleware, (req, res) => {
  res.json({ username: req.user.username });
});

app.get('/api/notes', authMiddleware, async (req, res) => {
  const notes = await db.getAllNotes(req.user.id);
  res.json(notes);
});

app.post('/api/notes', authMiddleware, async (req, res) => {
  const { title, content, color } = req.body;
  const note = await db.createNote(req.user.id, title || 'Basliksiz Not', content || '', color || '#ffffff');
  io.to('user:' + req.user.id).emit('note:created', note);
  res.json(note);
});

app.put('/api/notes/:id', authMiddleware, async (req, res) => {
  const { title, content, color, pinned } = req.body;
  const note = await db.updateNote(Number(req.params.id), req.user.id, { title, content, color, pinned });
  if (!note) return res.status(404).json({ error: 'Not bulunamadi' });
  io.to('user:' + req.user.id).emit('note:updated', note);
  res.json(note);
});

app.delete('/api/notes/:id', authMiddleware, async (req, res) => {
  const deleted = await db.deleteNote(Number(req.params.id), req.user.id);
  if (!deleted) return res.status(404).json({ error: 'Not bulunamadi' });
  io.to('user:' + req.user.id).emit('note:deleted', { id: Number(req.params.id) });
  res.json({ ok: true });
});

app.get('/api/search', authMiddleware, async (req, res) => {
  const q = req.query.q || '';
  const notes = await db.searchNotes(req.user.id, q);
  res.json(notes);
});

app.put('/api/password', authMiddleware, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) return res.status(400).json({ error: 'Mevcut ve yeni sifre gerekli' });
  if (newPassword.length < 4) return res.status(400).json({ error: 'Sifre en az 4 karakter olmali' });
  const user = await db.getUserById(req.user.id);
  const valid = await auth.comparePassword(currentPassword, user.password_hash);
  if (!valid) return res.status(401).json({ error: 'Mevcut sifre hatali' });
  const hash = await auth.hashPassword(newPassword);
  await db.updatePassword(req.user.id, hash);
  res.json({ ok: true });
});

app.get('/manifest.json', (req, res) => {
  res.json({
    name: 'Kisisel Notlar',
    short_name: 'Notlar',
    description: 'Kisisel not uygulamasi',
    start_url: '/',
    display: 'standalone',
    background_color: '#0f0f1a',
    theme_color: '#e94560',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' }
    ]
  });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

io.use(socketAuthMiddleware);
io.on('connection', (socket) => {
  const userId = socket.user.id;
  socket.join('user:' + userId);
  console.log('[+] Baglandi:', socket.user.username, socket.id);
  socket.on('disconnect', () => {
    console.log('[-] Ayrildi:', socket.user.username, socket.id);
  });
});

async function start() {
  await db.initialize();
  const adminUser = process.env.ADMIN_USERNAME || 'admin';
  const adminPass = process.env.ADMIN_PASSWORD || '1234';
  const existing = await db.getUserByUsername(adminUser);
  if (!existing) {
    const hash = await auth.hashPassword(adminPass);
    await db.createUser(adminUser, hash);
    console.log('  Admin kullanici olusturuldu: ' + adminUser);
  }

  server.listen(config.port, '0.0.0.0', () => {
    const localIP = getLocalIP();
    console.log('');
    console.log('============================================');
    console.log('  Kisisel Notlar v3.0 - Calisiyor!');
    console.log('============================================');
    console.log('');
    console.log('  Yerel       : http://localhost:' + config.port);
    console.log('  Ag          : http://' + localIP + ':' + config.port);
    console.log('  Ortam       : ' + config.nodeEnv);
    console.log('');
    if (config.nodeEnv === 'development') {
      console.log('  Kullanici   : ' + adminUser);
      console.log('  Sifre       : ' + adminPass);
      console.log('');
    }
    console.log('  Durdurmak   : Ctrl+C veya stop.bat');
    console.log('============================================');
    console.log('');
  });
}

function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) return iface.address;
    }
  }
  return '127.0.0.1';
}

start().catch(err => { console.error('Baslama hatasi:', err); process.exit(1); });
