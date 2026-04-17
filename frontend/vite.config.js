import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// Custom plugin to manage preloads
function optimizePreloads() {
  return {
    name: 'optimize-preloads',
    transformIndexHtml(html) {
      // Aggressively remove ALL preload links for faster initial load
      // Remove ONLY preloads, not stylesheets
      html = html.replace(/<link[^>]*\srel=['"]?(module)?preload['"]?[^>]*>/gi, '');
      html = html.replace(/<link[^>]*\shref=['"]?(undefined|null| )['"]?[^>]*>/gi, '');
      return html;
    },
  };
}

export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    optimizePreloads() // Add our custom preload optimization
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      'react-native': 'react-native-web',
      'react-native-svg': 'react-native-svg',
    },
  },
  server: {
    host: '0.0.0.0',
    port: 4000,
    strictPort: true,
    hmr: {
      protocol: 'ws',
      clientPort: 4000,
      timeout: 25000,
      overlay: false,
    },
    watch: {
      usePolling: true,
      interval: 100,
    },
    proxy: {
      // Proxy API requests to the backend
      '/api': {
        target: 'http://127.0.0.1:5001',
        changeOrigin: true,
        secure: false,
        ws: true, // Enable WebSocket proxying
      },
      // Proxy WebSocket requests
      '/socket.io': {
        target: 'ws://localhost:5001',
        ws: true,
        changeOrigin: true,
      },
      // Proxy uploads directory for images
      '/uploads': {
        target: 'http://localhost:5001',
        changeOrigin: true,
        secure: false,
        ws: true,
      },
    },
  },
  optimizeDeps: {
    include: ['react', 'react-dom', '@tanstack/react-query'],
    esbuildOptions: {
      // Node.js global to browser globalThis
      define: {
        global: 'globalThis',
      },
    },
  },
  build: {
    target: 'esnext',
    minify: 'terser',
    sourcemap: false, // Disable sourcemaps for better performance
    terserOptions: {
      compress: {
        drop_console: mode === 'production', // Remove console.logs in production
        drop_debugger: true,
      },
    },
    rollupOptions: {
      // external: ['react', 'react-dom'],
      output: {
        // globals: {
        //   react: 'React',
        //   'react-dom': 'ReactDOM',
        // },
        // Optimize chunking strategy for better loading
        manualChunks: (id) => {
          if (id.includes('node_modules')) {
            if (id.includes('@headlessui') || id.includes('@heroicons') || id.includes('react-icons')) {
              return 'vendor-ui';
            }
            if (id.includes('@tanstack/react-query') || id.includes('axios')) {
              return 'vendor-api';
            }
            if (id.includes('react-router-dom') || id.includes('@headlessui')) {
              return 'vendor-router';
            }
            return 'vendor';
          }

          // Split large components into separate chunks
          if (id.includes('pages/')) {
            if (id.includes('Home')) return 'page-home';
            if (id.includes('Cart') || id.includes('Checkout')) return 'page-commerce';
            if (id.includes('Product')) return 'page-products';
            if (id.includes('dashboard')) return 'page-dashboard';
            return 'pages';
          }

          if (id.includes('components/')) {
            if (id.includes('ProductCard') || id.includes('ServiceCard')) return 'components-cards';
            if (id.includes('ui/')) return 'components-ui';
            return 'components';
          }
        },
      },
    },
    chunkSizeWarningLimit: 600, // Reasonable chunk size limit (in kbs)
    // Disable preloading of all assets
    assetsInlineLimit: 0,
    // Disable CSS code splitting to prevent FOUC
    cssCodeSplit: false,
  },
  // Disable preloading of all assets
  experimental: {
    renderBuiltUrl(filename) {
      return { relative: true };
    },
  },
  define: {
    'process.env': {},
    global: {},
  },
}));