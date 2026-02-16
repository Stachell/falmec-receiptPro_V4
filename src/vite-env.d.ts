/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_PARSER_MODE?: 'auto' | 'devlogic' | 'typescript';
  readonly VITE_DEVLOGIC_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
