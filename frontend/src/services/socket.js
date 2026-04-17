import { io } from 'socket.io-client';

// WebSocket server URL - using the same host as the API but with WebSocket protocol
const getWsUrl = () => {
  if (process.env.NODE_ENV === 'development') return 'ws://localhost:5001';
  
  // Use VITE_SOCKET_URL from environment if available (standard for production builds)
  const envUrl = import.meta.env?.VITE_SOCKET_URL;
  if (envUrl) {
    // Convert https to wss or http to ws
    return envUrl.replace(/^http/, 'ws');
  }

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = window.location.host;
  return `${protocol}//${host}`;
};

const WS_URL = getWsUrl();

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
    transports: ['websocket', 'polling'], // Prioritize WebSocket but keep polling as fallback
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
