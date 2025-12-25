import { app, BrowserWindow } from "electron";
import { electronApp } from "@electron-toolkit/utils";
import { isMac } from "./utils/config";
import { initSingleLock } from "./utils/single-lock";
import { unregisterShortcuts } from "./shortcut";
import { initTray, MainTray } from "./tray";
import { processLog } from "./logger";
import { existsSync, mkdirSync } from "fs";
import { join } from "path";
import { trySendCustomProtocol } from "./utils/protocol";
import { SocketService } from "./services/SocketService";
// 导入时自动初始化投屏服务（使用副作用导入确保不被 tree-shaking）
import "./services/CastService";
import initAppServer from "../server";
import loadWindow from "./windows/load-window";
import mainWindow from "./windows/main-window";
import initIpc from "./ipc";

// 屏蔽报错
process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = "true";

// 便携模式下设置用户数据路径
if (process.env.PORTABLE_EXECUTABLE_DIR) {
  processLog.info(
    "🔍 Portable mode detected, setting userData path to:",
    join(process.env.PORTABLE_EXECUTABLE_DIR, "UserData"),
  );
  const userDataPath = join(process.env.PORTABLE_EXECUTABLE_DIR, "UserData");
  if (!existsSync(userDataPath)) mkdirSync(userDataPath, { recursive: true });
  app.setPath("userData", userDataPath);
}

// 主进程
class MainProcess {
  // 窗口
  mainWindow: BrowserWindow | null = null;
  loadWindow: BrowserWindow | null = null;
  // 托盘
  mainTray: MainTray | null = null;
  // 是否退出
  isQuit: boolean = false;
  constructor() {
    processLog.info("🚀 Main process startup");
    // 程序单例锁
    initSingleLock();
    // 监听应用事件
    this.handleAppEvents();
    // Electron 初始化完成后
    // 某些 API 只有在此事件发生后才能使用
    app.whenReady().then(async () => {
      processLog.info("🚀 Application Process Startup");
      // 设置应用程序名称
      electronApp.setAppUserModelId("com.imsyy.splayer");
      // 启动主服务进程
      await initAppServer();
      // 启动窗口
      this.loadWindow = loadWindow.create();
      this.mainWindow = mainWindow.create();
      // 注册其他服务
      this.mainTray = initTray(this.mainWindow!);
      // 注册 IPC 通信
      initIpc();
      // 自动启动 WebSocket
      SocketService.tryAutoStart();
    });
  }
  // 应用程序事件
  handleAppEvents() {
    // 窗口被关闭时
    app.on("window-all-closed", () => {
      if (!isMac) app.quit();
      this.mainWindow = null;
      this.loadWindow = null;
    });

    // 应用被激活
    app.on("activate", () => {
      const allWindows = BrowserWindow.getAllWindows();
      if (allWindows.length) {
        allWindows[0].focus();
      }
    });

    // 自定义协议
    app.on("open-url", (_, url) => {
      processLog.log("🔗 Received custom protocol URL:", url);
      trySendCustomProtocol(url);
    });

    // 将要退出
    app.on("will-quit", () => {
      // 注销全部快捷键
      unregisterShortcuts();
    });

    // 退出前
    app.on("before-quit", () => {
      this.isQuit = true;
    });
  }
}

export default new MainProcess();
