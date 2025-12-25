<template>
  <n-modal v-model:show="showModal" preset="card" :bordered="false" class="cast-modal" :style="{ width: '500px' }">
    <template #header>
      <n-flex align="center" :size="8">
        <SvgIcon name="Cast" :size="20" />
        <span>投屏到设备</span>
      </n-flex>
    </template>
    <div class="cast-content">
      <!-- 连接状态 -->
      <n-alert v-if="castStatus.isConnected" type="success" :bordered="false">
        <template #icon>
          <SvgIcon name="Link" />
        </template>
        已连接到: {{ castStatus.deviceName }}
      </n-alert>

      <!-- 设备列表 -->
      <div class="device-list">
        <n-spin :show="isScanning">
          <template #description>正在搜索设备...</template>
          <n-empty v-if="devices.length === 0 && !isScanning" description="未发现可用设备">
            <template #extra>
              <n-button size="small" @click="startSearch">重新搜索</n-button>
            </template>
          </n-empty>
          <n-list v-else hoverable clickable>
            <n-list-item
              v-for="device in devices"
              :key="device.host"
              @click="selectDevice(device)"
            >
              <template #prefix>
                <SvgIcon name="Cast" :size="24" />
              </template>
              <n-thing :title="device.name" :description="device.host" />
              <template #suffix>
                <n-tag
                  v-if="castStatus.deviceHost === device.host"
                  type="success"
                  size="small"
                >
                  已连接
                </n-tag>
              </template>
            </n-list-item>
          </n-list>
        </n-spin>
      </div>
    </div>
    <template #footer>
      <n-flex justify="space-between">
        <n-button v-if="castStatus.isConnected" type="error" ghost @click="disconnect">
          断开连接
        </n-button>
        <n-button v-else :loading="isScanning" @click="startSearch">
          {{ isScanning ? "搜索中..." : "搜索设备" }}
        </n-button>
        <n-button @click="showModal = false">关闭</n-button>
      </n-flex>
    </template>
  </n-modal>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from "vue";
import { useMusicStore } from "@/stores";
import { isElectron } from "@/utils/env";
import { useAudioManager } from "@/core/player/AudioManager";

// 弹窗显示状态
const showModal = defineModel<boolean>("show", { default: false });

const musicStore = useMusicStore();
const audioManager = useAudioManager();

// 设备列表
const devices = ref<CastDevice[]>([]);
// 扫描状态
const isScanning = ref(false);
// 投屏状态
const castStatus = ref<CastStatus>({
  isConnected: false,
  deviceName: null,
  deviceHost: null,
});

// 开始搜索设备
const startSearch = async () => {
  if (!isElectron || isScanning.value) return;

  devices.value = [];
  isScanning.value = true;

  try {
    await window.api.cast.search();
    // 10 秒后自动停止扫描
    setTimeout(() => {
      stopSearch();
    }, 10000);
  } catch (error) {
    console.error("搜索设备失败:", error);
    window.$message.error("搜索设备失败");
    isScanning.value = false;
  }
};

// 停止搜索
const stopSearch = async () => {
  if (!isElectron) return;
  try {
    await window.api.cast.stopScan();
  } catch (e) {
    console.error("停止扫描失败:", e);
  }
  isScanning.value = false;
};

// 选择设备并播放
const selectDevice = async (device: CastDevice) => {
  if (!isElectron) return;

  const song = musicStore.playSong;
  if (!song || !song.id) {
    window.$message.warning("没有正在播放的歌曲");
    return;
  }

  // 判断是否为本地文件
  const isLocal = !!song.path;
  // 获取播放 URL：本地文件使用 path，在线歌曲使用 AudioManager 的当前 src
  const playUrl = isLocal ? String(song.path || "") : audioManager.src;

  if (!playUrl) {
    window.$message.warning("无法获取歌曲播放地址");
    return;
  }

  try {
    const result = await window.api.cast.play({
      host: device.host,
      url: playUrl,
      isLocal: isLocal,
      title: song.name || "SPlayer Music",
    });

    if (result.status === "playing") {
      window.$message.success(`已投屏到 ${device.name}`);
      await refreshStatus();
    } else if (result.error) {
      window.$message.error(`投屏失败: ${result.error}`);
    }
  } catch (error) {
    console.error("投屏失败:", error);
    window.$message.error("投屏失败");
  }
};

// 断开连接
const disconnect = async () => {
  if (!isElectron) return;

  try {
    await window.api.cast.disconnect();
    window.$message.success("已断开投屏连接");
    await refreshStatus();
  } catch (error) {
    console.error("断开连接失败:", error);
    window.$message.error("断开连接失败");
  }
};

// 刷新投屏状态
const refreshStatus = async () => {
  if (!isElectron) return;

  try {
    castStatus.value = await window.api.cast.getStatus();
  } catch (e) {
    console.error("获取投屏状态失败:", e);
  }
};

// 设备发现回调
const handleDeviceFound = (device: CastDevice) => {
  const exists = devices.value.some((d) => d.host === device.host);
  if (!exists) {
    devices.value.push(device);
  }
};

// 弹窗打开时
watch(showModal, (val) => {
  if (val) {
    refreshStatus();
    // 获取已有设备列表
    if (isElectron) {
      window.api.cast.getDevices().then((list) => {
        devices.value = list;
      });
    }
  }
});

onMounted(() => {
  if (isElectron) {
    window.api.cast.onDeviceFound(handleDeviceFound);
    refreshStatus();
  }
});

onUnmounted(() => {
  if (isElectron) {
    window.api.cast.removeDeviceFoundListener();
    stopSearch();
  }
});
</script>

<style lang="scss" scoped>
.cast-modal {
  max-width: 420px;
}

.cast-content {
  min-height: 200px;
  display: flex;
  flex-direction: column;

  .device-list {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    margin-top: 16px;

    :deep(.n-spin-container) {
      width: 100%;
      min-height: 160px;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    :deep(.n-spin-content) {
      width: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    :deep(.n-empty) {
      margin: auto;
    }
  }
}
</style>
