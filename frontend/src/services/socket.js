import { io } from 'socket.io-client';

// Socket.IO server URL - MUST be http:// or https://, NOT ws:// or wss://.
// socket.io-client handles the WebSocket upgrade handshake internally.
// Passing wss:// directly skips the required HTTP handshake and causes 400 errors.
const getSocketUrl = () => {
  if (import.meta.env.DEV) return 'http://localhost:5001';

  // Derive from VITE_API_URL (e.g. "https://comrades360.shop/api" -> "https://comrades360.shop")
  const apiUrl = import.meta.env?.VITE_API_URL;
  if (apiUrl) {
    // Strip /api suffix to get the server root
    return apiUrl.replace(/\/api\/?$/, '');
  }

  // Final fallback: use current page origin (works when frontend & backend share the same domain)
  return window.location.origin;
};

const WS_URL = getSocketUrl();

let socket;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_DELAY = 3000; // 3 seconds

const connectSocket = () => {
  if (socket?.connected) return socket;

  // Close existing connection if any
  if (socket) {
    socket.disconnect();
  }

  // Create new socket connection
  socket = io(WS_URL, {
    transports: ['polling', 'websocket'], // Default to polling first, upgrade to websocket if possible (fixes proxy/cPanel issues)
    autoConnect: true,
    reconnection: true,
    reconnectionAttempts: MAX_RECONNECT_ATTEMPTS,
    reconnectionDelay: RECONNECT_DELAY,
    withCredentials: true,
    path: '/socket.io/', // Default Socket.IO path
  });

  // Connection event handlers
  socket.on('connect', () => {
    console.log('WebSocket connected');
    reconnectAttempts = 0; // Reset reconnect attempts on successful connection
  });

  socket.on('disconnect', (reason) => {
    console.log('WebSocket disconnected:', reason);
    if (reason === 'io server disconnect') {
      // The disconnection was initiated by the server, we need to reconnect manually
      socket.connect();
    }
  });

  socket.on('connect_error', (error) => {
    console.error('WebSocket connection error:', error.message);
    reconnectAttempts++;
    if (reconnectAttempts <= MAX_RECONNECT_ATTEMPTS) {
      console.log(`Reconnection attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS}...`);
    } else {
      console.error('Max reconnection attempts reached. Please check your connection.');
    }
  });

  return socket;
};

export const getSocket = () => {
  if (!socket) {
    return connectSocket();
  }
  return socket;
};

// Connect to user room when authenticated
export const joinUserRoom = (userId) => {
  if (!userId) return;
  
  const socketInstance = getSocket();
  
  if (socketInstance.connected) {
    socketInstance.emit('join_user', userId);
  } else {
    // If not connected, wait for connection first
    socketInstance.on('connect', () => {
      socketInstance.emit('join_user', userId);
    });
  }
};

// Admin room connection (for admin users)
export const joinAdminRoom = () => {
  const socketInstance = getSocket();
  
  if (socketInstance.connected) {
    socketInstance.emit('join_admin');
  } else {
    // If not connected, wait for connection first
    socketInstance.on('connect', () => {
      socketInstance.emit('join_admin');
    });
  }
};
