class GPUStatusManager {
    constructor() {
        console.log('GPUStatusManager initializing...');
        this.statusElement = document.getElementById('gpuStatus');
        this.translationInterval = null;
        this.isTranslating = false;
        
        if (this.statusElement) {
            console.log('GPU status element found');
            // 初始化时刷新一次
            this.updateGPUStatus();
        } else {
            console.error('GPU status element not found in HTML!');
        }
        
        // 添加刷新按钮事件监听
        const refreshBtn = document.getElementById('refreshGPU');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => {
                this.updateGPUStatus();
            });
        }
    }

    // 开始翻译时的监控
    startTranslationMonitoring() {
        this.isTranslating = true;
        // 立即更新一次
        this.updateGPUStatus();
        // 设置3秒间隔的更新
        this.translationInterval = setInterval(() => {
            if (this.isTranslating) {
                this.updateGPUStatus();
            }
        }, 3000);
    }

    // 停止翻译时的监控
    stopTranslationMonitoring() {
        this.isTranslating = false;
        if (this.translationInterval) {
            clearInterval(this.translationInterval);
            this.translationInterval = null;
        }
    }

    // 硬件模式改变时刷新
    refreshOnHardwareChange() {
        this.updateGPUStatus();
    }

    async updateGPUStatus() {
        try {
            const response = await ipcRenderer.invoke('get-gpu-status');
            console.log('GPU status received:', response);
            this.displayStatus(response);
        } catch (error) {
            console.error('获取GPU状态失败:', error);
            this.displayError(error);
        }
    }

    displayStatus(status) {
        if (!this.statusElement) return;

        const timestamp = new Date().toLocaleTimeString();
        let statusText = `GPU:(${timestamp})\n`;
        
        if (status.available) {
            statusText += `型号:${status.name}\n`;
            statusText += `显存:${status.memoryUsed}MB/${status.memoryTotal}MB\n`;
            statusText += `使用:${status.utilization}%\n`;
            statusText += `温度:${status.temperature}°C`;
        } else {
            statusText += '未检测到可用的NVIDIA显卡';
        }

        this.statusElement.value = statusText;
    }

    displayError(error) {
        if (!this.statusElement) return;
        
        const timestamp = new Date().toLocaleTimeString();
        this.statusElement.value = `GPU状态 (${timestamp})\n获取状态失败: ${error.message}`;
    }
}

// 初始化GPU状态管理器
window.addEventListener('DOMContentLoaded', () => {
    window.gpuStatusManager = new GPUStatusManager();
}); 