import { MessageApi, DialogApi, NotificationApi, LoadingBarApi, ModalApi } from "naive-ui";

/** 投屏设备 */
interface CastDevice {
  name: string;
  host: string;
  type: "dlna";
}

/** 投屏播放选项 */
interface CastPlayOptions {
  host: string;
  url: string;
  isLocal: boolean;
  title?: string;
}

/** 投屏控制选项 */
interface CastControlOptions {
  action: "pause" | "resume" | "stop" | "volume";
  value?: number;
}

/** 投屏状态 */
interface CastStatus {
  isConnected: boolean;
  deviceName: string | null;
  deviceHost: string | null;
}

declare global {
  interface Window {
    // naiveui
    $message: MessageApi;
    $dialog: DialogApi;
    $notification: NotificationApi;
    $loadingBar: LoadingBarApi;
    $modal: ModalApi;
    // electron
    api: {
      store: {
        get: (key: string) => Promise<unknown>;
        set: (key: string, value: unknown) => Promise<boolean>;
        has: (key: string) => Promise<boolean>;
        delete: (key: string) => Promise<boolean>;
        reset: (keys?: string[]) => Promise<boolean>;
        export: (data: unknown) => Promise<boolean>;
        import: () => Promise<unknown>;
      };
      cast: {
        search: () => Promise<{ status: string }>;
        getDevices: () => Promise<CastDevice[]>;
        play: (options: CastPlayOptions) => Promise<{ status: string; error?: string }>;
        control: (options: CastControlOptions) => Promise<{ status: string; error?: string }>;
        stopScan: () => Promise<{ status: string }>;
        getStatus: () => Promise<CastStatus>;
        disconnect: () => Promise<{ status: string }>;
        onDeviceFound: (callback: (device: CastDevice) => void) => void;
        removeDeviceFoundListener: () => void;
      };
    };
  }
}
