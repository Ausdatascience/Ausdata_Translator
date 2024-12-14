class Translator {
    constructor() {
        this.sourceText = document.getElementById('sourceText');
        this.targetText = document.getElementById('targetText');
        this.sourceLang = document.getElementById('sourceLang');
        this.targetLang = document.getElementById('targetLang');
        this.translateBtn = document.getElementById('translateBtn');
        this.cancelBtn = document.getElementById('cancelBtn');
        this.clearBtn = document.getElementById('clearBtn');
        this.copyBtn = document.getElementById('copyBtn');
        this.statusMessage = document.querySelector('.sidebar-message');
        this.isTranslating = false;
        this.currentDevice = 'auto';
        
        // 初始状态设置
        this.translateBtn.disabled = false;
        this.cancelBtn.disabled = true;
        this.cancelBtn.style.display = 'inline-block';
        
        this.initEventListeners();
        this.initShortcuts();
        this.initTextControls();
        this.initHardwareSettings();
        
        // 添加快捷键支持
        this.initShortcuts();
        
        // 添加字体大小相关变量
        this.defaultFontSize = 14;
        this.minFontSize = 12;
        this.maxFontSize = 24;
        
        // 初始化硬件选择
        this.initHardwareSettings();
    }

    initEventListeners() {
        // 翻译按钮点击事件
        this.translateBtn.addEventListener('click', () => this.translate());
        
        // 终止按钮点击事件
        this.cancelBtn.addEventListener('click', () => this.cancelTranslation());
        
        // 清空按钮点击事件
        this.clearBtn.addEventListener('click', () => this.clear());
        
        // 复制按钮点击事件
        this.copyBtn.addEventListener('click', () => this.copy());
        
        // 预览按钮点击事件
        document.getElementById('previewBtn').addEventListener('click', () => {
            const text = this.targetText.value;
            if (text) {
                ipcRenderer.send('open-preview', text);
            }
        });
        
        // 监听翻译结果
        ipcRenderer.on('translation-result', (event, result) => {
            console.log('收到翻译结果:', result);
            this.handleTranslationResult(result);
        });
        
        // 监听错误信息
        ipcRenderer.on('translation-error', (event, error) => {
            console.error('收到错误:', error);
            this.handleError(error);
        });
        
        // 监听状态更新
        ipcRenderer.on('status-update', (event, status) => {
            console.log('收到状态更新:', status);
            this.updateStatus(status);
        });
    }

    initShortcuts() {
        document.addEventListener('keydown', (e) => {
            if (window.shortcutManager.matchShortcut(e, 'translate')) {
                if (!this.isTranslating && !this.translateBtn.disabled) {
                    this.translate();
                }
                e.preventDefault();
            }
            
            if (window.shortcutManager.matchShortcut(e, 'cancel')) {
                if (this.isTranslating && !this.cancelBtn.disabled) {
                    this.cancelTranslation();
                }
                e.preventDefault();
            }
            
            if (window.shortcutManager.matchShortcut(e, 'copy')) {
                const activeElement = document.activeElement;
                const isTextArea = activeElement.tagName === 'TEXTAREA';
                
                if (!isTextArea && !window.getSelection().toString()) {
                    this.copy();
                    e.preventDefault();
                }
            }
        });

        // 更新按键提示
        this.updateShortcutHints();
    }

    updateShortcutHints() {
        const shortcuts = window.shortcutManager.shortcuts;
        this.translateBtn.title = `翻译 (${shortcuts.translate})`;
        this.cancelBtn.title = `终止 (${shortcuts.cancel})`;
        this.copyBtn.title = `复制 (${shortcuts.copy})`;
    }

    translate() {
        const text = this.sourceText.value.trim();
        if (!text) {
            this.updateStatus({ status: '请输入要翻译的文本' });
            return;
        }

        this.isTranslating = true;
        this.translateBtn.disabled = true;
        this.cancelBtn.disabled = false;
        this.updateStatus({ status: '正在翻译...' });
        this.targetText.value = '';

        const data = {
            text: text,
            sourceLang: this.sourceLang.value,
            targetLang: this.targetLang.value,
            hardware: document.querySelector('input[name="hardware"]:checked')?.value || 'auto'
        };

        console.log('发送翻译请求:', data);

        this.timeoutId = setTimeout(() => {
            if (this.isTranslating) {
                this.handleError({
                    status: 'error',
                    error: '翻译请求超时（30秒），可能是首次加载模型较慢，请重试'
                });
            }
        }, 30000);

        ipcRenderer.send('translate-text', data);

        // 开始翻译时
        if (window.gpuStatusManager) {
            window.gpuStatusManager.startTranslationMonitoring();
        }
    }

    cancelTranslation() {
        if (this.timeoutId) {
            clearTimeout(this.timeoutId);
        }
        
        this.isTranslating = false;
        this.translateBtn.disabled = false;  // 启用翻译按钮
        this.cancelBtn.disabled = true;     // 禁用终止按钮
        this.updateStatus({ status: '翻译已终止' });
        
        // 发送取消请求到主进程
        ipcRenderer.send('cancel-translation');
    }

    handleTranslationResult(result) {
        console.log('收到翻译结果:', result);
        
        // 处理设备切换的响应
        if (result.device) {
            this.currentDevice = result.device.toLowerCase();
            this.updateStatus({ status: result.message || '备切换成功' });
            return;
        }

        if (result.status === 'success' || result.status === 'partial') {
            if (!this.isTranslating) return;
            
            this.targetText.value = result.translation;
            
            if (result.progress) {
                const progress = `${result.progress.percentage}% (${result.progress.current}/${result.progress.total})`;
                this.updateStatus({ status: `正在翻译... ${progress}` });
                if (window.gpuStatusManager) {
                    window.gpuStatusManager.updateGPUStatus();
                }
            }
            
            if (result.is_final) {
                this.isTranslating = false;
                this.translateBtn.disabled = false;  // 启用翻译按钮
                this.cancelBtn.disabled = true;     // 禁用终止按钮
                const stats = `原文长度: ${result.original_length} | 译文长度: ${result.translated_length}`;
                this.updateStatus({ status: `翻译完成 (${stats})` });
                
                if (window.historyManager) {
                    window.historyManager.add(
                        this.sourceText.value,
                        result.translation,
                        result.source_lang,
                        result.target_lang
                    );
                }
            }
        } else if (result.status === 'cancelled') {
            this.isTranslating = false;
            this.translateBtn.disabled = false;  // 启用翻译按钮
            this.cancelBtn.disabled = true;      // 禁用终止按钮
            this.updateStatus({ status: '翻译已终止' });
        } else if (result.status === 'Loading model...' || result.status === 'Ready') {
            this.updateStatus({ status: result.status });
        } else {
            this.handleError(result);
        }

        // 翻译完成时
        if (result.is_final || result.status === 'cancelled') {
            if (window.gpuStatusManager) {
                window.gpuStatusManager.stopTranslationMonitoring();
            }
        }
    }

    handleError(error) {
        console.error('处理错误:', error);
        
        // 如果是警告信息，则忽略
        if (error.error && (
            error.error.includes('UserWarning') ||
            error.error.includes('do_sample')
        )) {
            return;
        }
        
        this.isTranslating = false;
        this.translateBtn.disabled = false;  // 启用翻译按钮
        this.cancelBtn.disabled = true;      // 禁用终止按钮
        this.updateStatus({ status: error.error || error.status || '翻译失败' });
    }

    updateStatus(status) {
        const timestamp = new Date().toLocaleTimeString();
        // 获取当前选中的硬件模式
        const selectedHardware = document.querySelector('input[name="hardware"]:checked')?.value;
        
        // 根据实际选择的模式显示对应文本
        const deviceText = selectedHardware === 'cpu' ? 'CPU' : 
                          selectedHardware === 'gpu' ? '强制使用 GPU' : 
                          '自动选择 (优先GPU)';
        
        this.statusMessage.value = `开发:Ausdata Science\n` +
            `状态: ${status.status}\n` +
            `设备: ${deviceText}\n` +
            `时间: ${timestamp}`;
        
        // 如果正在翻译，触发GPU状态更新
        if (status.status.includes('正在翻译')) {
            if (window.gpuStatusManager) {
                window.gpuStatusManager.updateGPUStatus();
            }
        }
    }

    clear() {
        this.sourceText.value = '';
        this.targetText.value = '';
        this.updateStatus({ status: '就绪' });
    }

    async copy() {
        const text = this.targetText.value;
        if (text) {
            try {
                await navigator.clipboard.writeText(text);
                this.updateStatus({ status: '已复制到剪贴板' });
            } catch (e) {
                this.updateStatus({ status: '复制失败' });
            }
        }
    }

    initTextControls() {
        // 源文本面板控制
        const sourceControls = document.querySelector('.source-panel .text-controls');
        sourceControls.querySelector('[title="默认字体"]').addEventListener('click', () => this.resetFontSize(this.sourceText));
        sourceControls.querySelector('[title="放大字体"]').addEventListener('click', () => this.increaseFontSize(this.sourceText));
        sourceControls.querySelector('[title="缩小字体"]').addEventListener('click', () => this.decreaseFontSize(this.sourceText));
        sourceControls.querySelector('[title="清除文本"]').addEventListener('click', () => this.clearText(this.sourceText));
        sourceControls.querySelector('[title="朗读文本"]').addEventListener('click', () => {
            // 调用独立的朗读服务
            const result = window.speechService.speak(this.sourceText.value, this.sourceLang.value);
            this.updateStatus({ status: result.message });
        });

        // 目标文本面板控制
        const targetControls = document.querySelector('.target-panel .text-controls');
        targetControls.querySelector('[title="默认字体"]').addEventListener('click', () => this.resetFontSize(this.targetText));
        targetControls.querySelector('[title="放大字体"]').addEventListener('click', () => this.increaseFontSize(this.targetText));
        targetControls.querySelector('[title="缩小字体"]').addEventListener('click', () => this.decreaseFontSize(this.targetText));
        targetControls.querySelector('[title="朗读文本"]').addEventListener('click', () => {
            // 调用独立的朗读服务
            const result = window.speechService.speak(this.targetText.value, this.targetLang.value);
            this.updateStatus({ status: result.message });
        });
        targetControls.querySelector('[title="复制文本"]').addEventListener('click', () => this.copyText(this.targetText));
    }

    // 字体大小调整功能
    increaseFontSize(textarea) {
        const currentSize = parseInt(window.getComputedStyle(textarea).fontSize);
        if (currentSize < this.maxFontSize) {
            textarea.style.fontSize = `${currentSize + 2}px`;
        }
    }

    decreaseFontSize(textarea) {
        const currentSize = parseInt(window.getComputedStyle(textarea).fontSize);
        if (currentSize > this.minFontSize) {
            textarea.style.fontSize = `${currentSize - 2}px`;
        }
    }

    resetFontSize(textarea) {
        textarea.style.fontSize = `${this.defaultFontSize}px`;
    }

    // 清除文本功能
    clearText(textarea) {
        textarea.value = '';
        if (textarea === this.sourceText) {
            this.targetText.value = '';  // 如果清除源文本，同时清除目标文本
            this.updateStatus({ status: '已清除文本' });
        }
    }

    // 复制本功能
    async copyText(textarea) {
        const text = textarea.value;
        if (text) {
            try {
                await navigator.clipboard.writeText(text);
                this.updateStatus({ status: '已复制到剪贴板' });
            } catch (e) {
                this.updateStatus({ status: '复制失败' });
            }
        }
    }

    initHardwareSettings() {
        document.querySelectorAll('input[name="hardware"]').forEach(radio => {
            radio.addEventListener('change', async () => {
                const hardware = radio.value;
                this.updateStatus({ status: '正在切换硬件...' });
                
                try {
                    const data = { hardware: hardware };
                    this.currentDevice = hardware; // 更新当前设备状态
                    ipcRenderer.send('translate-text', data);
                } catch (error) {
                    console.error('切换硬件失败:', error);
                    this.updateStatus({ status: '切换硬件失败: ' + error.message });
                }

                // 硬件模式改变时
                if (window.gpuStatusManager) {
                    window.gpuStatusManager.refreshOnHardwareChange();
                }
            });
        });
    }
}

// 初始化译器
window.addEventListener('DOMContentLoaded', () => {
    window.translator = new Translator();
}); 