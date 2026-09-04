import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { WagmiProvider } from 'wagmi';
import { App } from './App';
import { wagmiConfig } from './lib/wagmi';
import './styles/theme.css';
import './styles/app.css';
import './styles/squid-loader.css';
import { SplashDismiss } from './components/brand-loader';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Prices move; nothing here is worth showing stale for long, and the server caches upstream.
      staleTime: 10_000,
      retry: 1,
      refetchOnWindowFocus: true,
    },
  },
});

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('#root missing');

createRoot(rootEl).render(
  <StrictMode>
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </QueryClientProvider>
    </WagmiProvider>
    <SplashDismiss />
  </StrictMode>,
);
