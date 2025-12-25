import { contextBridge, ipcRenderer } from "electron";
import { electronAPI } from "@electron-toolkit/preload";

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld("electron", electronAPI);
    // Expose store API via preload
    contextBridge.exposeInMainWorld("api", {
      store: {
        get: (key: string) => ipcRenderer.invoke("store-get", key),
        set: (key: string, value: unknown) => ipcRenderer.invoke("store-set", key, value),
        has: (key: string) => ipcRenderer.invoke("store-has", key),
        delete: (key: string) => ipcRenderer.invoke("store-delete", key),
        reset: (keys?: string[]) => ipcRenderer.invoke("store-reset", keys),
        export: (data: any) => ipcRenderer.invoke("store-export", data),
        import: () => ipcRenderer.invoke("store-import"),
      },
      cast: {
        search: () => ipcRenderer.invoke("cast-search"),
        getDevices: () => ipcRenderer.invoke("cast-get-devices"),
        play: (options: { host: string; url: string; isLocal: boolean; title?: string }) =>
          ipcRenderer.invoke("cast-play", options),
        control: (options: { action: string; value?: number }) =>
          ipcRenderer.invoke("cast-control", options),
        stopScan: () => ipcRenderer.invoke("cast-stop-scan"),
        getStatus: () => ipcRenderer.invoke("cast-get-status"),
        disconnect: () => ipcRenderer.invoke("cast-disconnect"),
        onDeviceFound: (callback: (device: { name: string; host: string; type: string }) => void) => {
          ipcRenderer.on("cast-device-found", (_, device) => callback(device));
        },
        removeDeviceFoundListener: () => {
          ipcRenderer.removeAllListeners("cast-device-found");
        },
      },
    });
  } catch (error) {
    console.error(error);
  }
}
