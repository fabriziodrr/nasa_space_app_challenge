/// <reference types="vite/client" />

interface ViteTypeOptions {
  strictImportMetaEnv: unknown;
}

interface ImportMetaEnv {
  readonly VITE_APP_BASE_PATH?: string;
  readonly VITE_MODEL_PATH?: string;
  readonly VITE_WASM_PATH?: string;
  readonly VITE_AGENT_ORIGIN?: string;
}
