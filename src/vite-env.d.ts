/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE?: string;
  readonly VITE_WC_PROJECT_ID?: string;
  readonly VITE_BASE_RPC_URLS?: string;
  readonly VITE_CHAT_URL?: string;
  readonly VITE_MARKETS_URL?: string;
}
