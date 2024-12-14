const { ipcRenderer } = require('electron');

class ModelService {
    constructor() {
        console.log('ModelService initialized');
        this.currentModel = null;
        this.modelInfo = null;
    }

    async getCurrentModel() {
        console.log('getCurrentModel called');
        try {
            console.log('Sending IPC request for model info');
            this.modelInfo = await ipcRenderer.invoke('get-model-info');
            console.log('Received model info:', this.modelInfo);
            return this.modelInfo;
        } catch (error) {
            console.error('获取模型信息失败:', error);
            return null;
        }
    }

    updateModelStatus(elementId) {
        console.log('updateModelStatus called for element:', elementId);
        const modelInfoElement = document.getElementById(elementId);
        if (!modelInfoElement) {
            console.error('Model info element not found:', elementId);
            return;
        }

        this.getCurrentModel().then(info => {
            console.log('Model info updated:', info);
            if (info) {
                modelInfoElement.innerHTML = `
                    <div class="model-info">
                        <div class="model-name">当前模型：${info.name}</div>
                        <div class="model-details">
                            <span>类型：${info.type}</span>
                            <span>量化：${info.quantization}</span>
                            <span>上下文长度：${info.context_length}</span>
                        </div>
                        <div class="model-status ${info.status === 'ready' ? 'status-ready' : 'status-loading'}">
                            状态：${info.status === 'ready' ? '就绪' : '加载中'}
                        </div>
                    </div>
                `;
            } else {
                modelInfoElement.innerHTML = '<div class="model-error">无法获取模型信息</div>';
            }
        }).catch(error => {
            console.error('Error updating model status:', error);
            modelInfoElement.innerHTML = '<div class="model-error">更新状态失败: ' + error.message + '</div>';
        });
    }
}

module.exports = {
    modelService: new ModelService()
}; 