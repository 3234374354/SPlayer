import { ElectronAPI } from "@electron-toolkit/preload";
import type { StoreType } from "../main/store";

declare global {
  interface CastDevice {
    name: string;
    host: string;
    type: "dlna";
  }

  interface CastPlayOptions {
    host: string;
    url: string;
    isLocal: boolean;
    title?: string;
  }

  interface CastControlOptions {
    action: "pause" | "resume" | "stop" | "volume";
    value?: number;
  }

  interface CastStatus {
    isConnected: boolean;
    deviceName: string | null;
    deviceHost: string | null;
  }

  interface Window {
    electron: ElectronAPI;
    api: {
      store: {
        get<K extends keyof StoreType>(key: K): Promise<StoreType[K]>;
        set<K extends keyof StoreType>(key: K, value: StoreType[K]): Promise<boolean>;
        has(key: keyof StoreType): Promise<boolean>;
        delete(key: keyof StoreType): Promise<boolean>;
        reset(keys?: (keyof StoreType)[]): Promise<boolean>;
        export(data: unknown): Promise<boolean>;
        import(): Promise<boolean>;
      };
      cast: {
        search(): Promise<{ status: string }>;
        getDevices(): Promise<CastDevice[]>;
        play(options: CastPlayOptions): Promise<{ status: string; error?: string }>;
        control(options: CastControlOptions): Promise<{ status: string; error?: string }>;
        stopScan(): Promise<{ status: string }>;
        getStatus(): Promise<CastStatus>;
        disconnect(): Promise<{ status: string }>;
        onDeviceFound(callback: (device: CastDevice) => void): void;
        removeDeviceFoundListener(): void;
      };
    };
  }
}
