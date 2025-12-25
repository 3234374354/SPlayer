// electron/main/services/CastService.ts
import { ipcMain, BrowserWindow } from "electron";
import dlnacasts from "dlnacasts";
import ip from "ip";
import express, { Request, Response } from "express";
import http from "http";
import { existsSync } from "fs";
import { extname, normalize, isAbsolute } from "path";
import { processLog } from "../logger";

/** 设备类型 */
interface CastDevice {
  name: string;
  host: string;
  type: "dlna";
}

/** 播放器实例类型 */
interface DLNAPlayer {
  name: string;
  host: string;
  play: (url: string, options?: { title?: string }) => void;
  pause: () => void;
  resume: () => void;
  stop: () => void;
  volume: (value: number) => void;
}

/** 投屏服务 */
class CastService {
  private players: DLNAPlayer[] = [];
  private activePlayer: DLNAPlayer | null = null;
  private localServer: http.Server | null = null;
  private localIp: string = "";
  private filePort: number = 25885;
  private dlnaInstance: ReturnType<typeof dlnacasts> | null = null;
  private isScanning: boolean = false;
  private serverStarted: boolean = false;

  // 允许的音频扩展名
  private allowedExtensions = [
    ".mp3",
    ".flac",
    ".wav",
    ".aac",
    ".ogg",
    ".m4a",
    ".wma",
    ".ape",
    ".aiff",
  ];

  constructor() {
    this.initIpc();
    processLog.info("(cast)     > 🎬 CastService initialized");
  }

  /** 获取本机内网 IP */
  private getLocalIp(): string {
    if (!this.localIp) {
      try {
        this.localIp = ip.address();
      } catch {
        this.localIp = "127.0.0.1";
      }
    }
    return this.localIp;
  }

  /** 启动本地 HTTP 文件服务器（按需启动） */
  private ensureLocalServer(): boolean {
    if (this.serverStarted) return true;

    try {
      const app = express();

      // 流式传输本地文件
      app.get("/stream", (req: Request, res: Response): void => {
        const filePath = req.query.path as string;

        if (!filePath) {
          res.status(400).send("Missing path parameter");
          return;
        }

        // 安全校验：验证路径
        const normalizedPath = normalize(filePath);

        // 检查是否为绝对路径且文件存在
        if (!isAbsolute(normalizedPath) || !existsSync(normalizedPath)) {
          res.status(404).send("File not found");
          return;
        }

        // 检查文件扩展名是否为允许的音频格式
        const ext = extname(normalizedPath).toLowerCase();
        if (!this.allowedExtensions.includes(ext)) {
          res.status(403).send("File type not allowed");
          return;
        }

        // 发送文件
        res.sendFile(normalizedPath, (err) => {
          if (err) {
            processLog.error("(cast)     > 文件发送失败:", err.message);
          }
        });
      });

      this.localServer = app.listen(this.filePort, () => {
        processLog.info(`(cast)     > 本地文件服务器启动于端口 ${this.filePort}`);
      });

      this.serverStarted = true;
      return true;
    } catch (err) {
      processLog.error("(cast)     > 本地服务器启动失败:", err);
      return false;
    }
  }

  /** 初始化 IPC 监听 */
  private initIpc() {
    // 搜索设备
    ipcMain.handle("cast-search", async () => {
      return this.searchDevices();
    });

    // 获取已发现的设备列表
    ipcMain.handle("cast-get-devices", () => {
      return this.players.map((p) => ({
        name: p.name,
        host: p.host,
        type: "dlna" as const,
      }));
    });

    // 连接并播放
    ipcMain.handle(
      "cast-play",
      async (
        _,
        {
          host,
          url,
          isLocal,
          title,
        }: { host: string; url: string; isLocal: boolean; title?: string },
      ) => {
        return this.playOnDevice(host, url, isLocal, title);
      },
    );

    // 控制指令
    ipcMain.handle(
      "cast-control",
      async (_, { action, value }: { action: string; value?: number }) => {
        return this.controlPlayback(action, value);
      },
    );

    // 停止扫描
    ipcMain.handle("cast-stop-scan", () => {
      this.stopScanning();
      return { status: "stopped" };
    });

    // 获取当前投屏状态
    ipcMain.handle("cast-get-status", () => {
      return {
        isConnected: !!this.activePlayer,
        deviceName: this.activePlayer?.name || null,
        deviceHost: this.activePlayer?.host || null,
      };
    });

    // 断开连接
    ipcMain.handle("cast-disconnect", () => {
      if (this.activePlayer) {
        try {
          this.activePlayer.stop();
          processLog.info(`(cast)     > 已断开: ${this.activePlayer.name}`);
        } catch {
          // 静默处理断开错误
        }
        this.activePlayer = null;
      }
      return { status: "disconnected" };
    });
  }

  /** 搜索 DLNA 设备 */
  private searchDevices(): Promise<{ status: string }> {
    return new Promise((resolve) => {
      if (this.isScanning) {
        resolve({ status: "already_scanning" });
        return;
      }

      processLog.info("(cast)     > 开始搜索 DLNA 设备...");
      this.isScanning = true;
      this.players = [];

      try {
        // 创建新的 dlnacasts 实例
        this.dlnaInstance = dlnacasts();

        this.dlnaInstance.on("update", (player: DLNAPlayer) => {
          // 检查是否已存在
          const exists = this.players.some((p) => p.host === player.host);
          if (!exists) {
            this.players.push(player);

            // 通知所有渲染进程发现新设备
            const device: CastDevice = {
              name: player.name,
              host: player.host,
              type: "dlna",
            };

            BrowserWindow.getAllWindows().forEach((win) => {
              win.webContents.send("cast-device-found", device);
            });

            processLog.info(`(cast)     > 发现设备: ${player.name} (${player.host})`);
          }
        });

        resolve({ status: "scanning" });
      } catch (err) {
        processLog.error("(cast)     > 设备搜索失败:", err);
        this.isScanning = false;
        resolve({ status: "error" });
      }
    });
  }

  /** 停止扫描 */
  private stopScanning() {
    if (!this.isScanning) return;

    this.isScanning = false;
    if (this.dlnaInstance) {
      try {
        this.dlnaInstance.destroy?.();
      } catch {
        // 静默处理销毁错误
      }
      this.dlnaInstance = null;
    }
    processLog.info(`(cast)     > 停止搜索，共发现 ${this.players.length} 个设备`);
  }

  /** 在设备上播放 */
  private playOnDevice(
    host: string,
    url: string,
    isLocal: boolean,
    title?: string,
  ): { status: string; error?: string } {
    const player = this.players.find((p) => p.host === host);

    if (!player) {
      return { status: "error", error: "未找到设备" };
    }

    this.activePlayer = player;

    let playUrl = url;

    // 如果是本地文件，转换为内网 HTTP 地址
    if (isLocal) {
      // 确保本地服务器已启动
      if (!this.ensureLocalServer()) {
        return { status: "error", error: "本地服务器启动失败" };
      }
      playUrl = `http://${this.getLocalIp()}:${this.filePort}/stream?path=${encodeURIComponent(url)}`;
    }

    try {
      player.play(playUrl, { title: title || "SPlayer Music" });
      processLog.info(`(cast)     > 投屏到 ${player.name}`);
      return { status: "playing" };
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      processLog.error(`(cast)     > 播放失败: ${errMsg}`);
      return { status: "error", error: errMsg };
    }
  }

  /** 控制播放 */
  private controlPlayback(
    action: string,
    value?: number,
  ): { status: string; error?: string } {
    if (!this.activePlayer) {
      return { status: "error", error: "无活动设备" };
    }

    try {
      switch (action) {
        case "pause":
          this.activePlayer.pause();
          break;
        case "resume":
          this.activePlayer.resume();
          break;
        case "stop":
          this.activePlayer.stop();
          break;
        case "volume":
          if (value !== undefined) {
            this.activePlayer.volume(value);
          }
          break;
        default:
          return { status: "error", error: "未知操作" };
      }
      return { status: "ok" };
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      return { status: "error", error: errMsg };
    }
  }

  /** 销毁服务 */
  destroy() {
    this.stopScanning();
    if (this.localServer) {
      this.localServer.close();
      this.localServer = null;
      this.serverStarted = false;
    }
  }
}

export const castService = new CastService();
export default castService;
