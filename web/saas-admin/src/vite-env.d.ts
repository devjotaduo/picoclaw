/// <reference types="vite/client" />

interface ImportMetaEnv {
	readonly VITE_CLARA_DEFAULT?: string;
}

interface ImportMeta {
	readonly env: ImportMetaEnv;
}
