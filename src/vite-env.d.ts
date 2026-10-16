/// <reference types="vite/client" />

interface Window {
  GFDAI?: {
    extendInstructions(instructions?: string): string;
    loadKoreanModel(options?: { contextLength?: number; useGpu?: boolean; onProgress?: (message: string) => void }): Promise<unknown>;
    getMode(): 'existing' | 'free' | 'local';
    setMode(value: 'existing' | 'free' | 'local'): boolean;
    generate(options: { messages: Array<{ role: string; content: string }>; systemPrompt?: string; instructions?: string; onToken?: (token: string) => void; signal?: AbortSignal }): Promise<string>;
  };
  GFDPlugins?: {
    list(): Array<{ id: string; name: string; version: string; description: string; context: string; enabled: boolean }>;
    setEnabled(id: string, enabled: boolean): boolean;
    extendInstructions(instructions?: string): string;
  };
  GFDPluginsReady?: Promise<NonNullable<Window['GFDPlugins']>>;
}
