const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const { getSessionMiddleware } = require('./config/session');
const webRoutes = require('./routes/webRoutes');
const authRoutes = require('./routes/authRoutes');
const apiRoutes = require('./routes/apiRoutes');
const { setIo, getConnectionStatus, getQrCodeData } = require('./services/whatsappService');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Teruskan io ke whatsappService
setIo(io);

// Basic Middlewares
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.set('trust proxy', 1);

// Session Middleware
app.use(getSessionMiddleware());

// Static Files & Public Routes
app.use('/', webRoutes);

// Static assets (CSS, JS, Images)
const publicDir = path.join(__dirname, 'public');
app.use(express.static(publicDir, {
  index: false,
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-store');
    }
  }
}));

// Router Registrations
app.use('/api/auth', authRoutes);
app.use('/api', apiRoutes);

// Socket.io Session Protection & Connections
io.use((socket, next) => {
  getSessionMiddleware()(socket.request, {}, () => {
    const session = socket.request.session;
    if (session && session.authenticated) {
      return next();
    }
    return next(new Error('Unauthorized Socket Connection'));
  });
});

io.on('connection', (socket) => {
  const currentStatus = getConnectionStatus();
  const currentQr = getQrCodeData();
  
  socket.emit('status', { status: currentStatus });
  if (currentQr && currentStatus !== 'open') {
    socket.emit('qr', currentQr);
  }
});

module.exports = {
  app,
  server,
  io,
};
