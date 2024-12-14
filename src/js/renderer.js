const { ipcRenderer } = require('electron')

// 主题管理
class ThemeManager {
    constructor() {
        this.theme = localStorage.getItem('theme') || 'system'
        this.init()
    }

    init() {
        this.applyTheme()
        this.bindEvents()
        this.setupSystemThemeListener()
    }

    bindEvents() {
        document.getElementById('theme-toggle').addEventListener('click', () => {
            this.toggleTheme()
        })

        document.getElementById('themeSelect').addEventListener('change', (e) => {
            this.setTheme(e.target.value)
        })
    }

    setupSystemThemeListener() {
        if (window.matchMedia) {
            window.matchMedia('(prefers-color-scheme: dark)').addListener(() => {
                if (this.theme === 'system') {
                    this.applyTheme()
                }
            })
        }
    }

    setTheme(theme) {
        this.theme = theme
        localStorage.setItem('theme', theme)
        this.applyTheme()
    }

    toggleTheme() {
        const themes = ['light', 'dark']
        const currentIndex = themes.indexOf(this.theme)
        const nextTheme = themes[(currentIndex + 1) % themes.length]
        this.setTheme(nextTheme)
    }

    applyTheme() {
        const isDark = this.theme === 'dark' || 
            (this.theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
        document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light')
        document.getElementById('themeSelect').value = this.theme
    }
}

// 历史记录管理
class HistoryManager {
    constructor() {
        this.history = JSON.parse(localStorage.getItem('translationHistory') || '[]')
        this.enabled = JSON.parse(localStorage.getItem('saveHistory') || 'true')
        this.maxItems = 100
        this.searchTerm = ''
        this.currentFilter = 'all'
        this.init()
    }

    init() {
        this.bindEvents()
        this.render()
    }

    bindEvents() {
        document.getElementById('saveHistory').checked = this.enabled
        document.getElementById('saveHistory').addEventListener('change', (e) => {
            this.enabled = e.target.checked
            localStorage.setItem('saveHistory', this.enabled)
        })

        document.getElementById('clearHistory').addEventListener('click', () => {
            if (confirm('确定要清除所有历史记录吗？')) {
                this.clear()
            }
        })

        document.querySelector('.history-list').addEventListener('click', (e) => {
            const item = e.target.closest('.history-item')
            if (item) {
                this.showHistoryDetail(item.dataset.id)
            }
        })

        const modal = document.getElementById('historyDetailModal')
        modal.querySelector('.modal-close').addEventListener('click', () => {
            modal.classList.remove('show')
        })

        modal.querySelector('.copy-source').addEventListener('click', () => {
            const text = modal.querySelector('.history-source').value
            navigator.clipboard.writeText(text).then(() => {
                this.showToast('原文已复制')
            })
        })

        modal.querySelector('.copy-target').addEventListener('click', () => {
            const text = modal.querySelector('.history-target').value
            navigator.clipboard.writeText(text).then(() => {
                this.showToast('译文已复制')
            })
        })

        modal.querySelector('.translate-again').addEventListener('click', () => {
            const sourceText = modal.querySelector('.history-source').value
            const sourceLang = modal.querySelector('.history-langs').dataset.sourceLang
            const targetLang = modal.querySelector('.history-langs').dataset.targetLang
            
            document.getElementById('sourceText').value = sourceText
            document.getElementById('sourceLang').value = sourceLang
            document.getElementById('targetLang').value = targetLang
            
            window.navigationManager.showTab('translate')
            window.translator.translate()
            
            modal.classList.remove('show')
        })

        // 添加搜索功能
        document.getElementById('historySearch').addEventListener('input', (e) => {
            this.searchTerm = e.target.value.toLowerCase()
            this.render()
        })

        // 添加筛选功能
        document.getElementById('historyFilter').addEventListener('change', (e) => {
            this.currentFilter = e.target.value
            this.render()
        })

        // 添加导出功能
        document.getElementById('exportHistory').addEventListener('click', () => {
            this.exportHistory()
        })
    }

    showHistoryDetail(id) {
        const item = this.history.find(h => h.id === parseInt(id))
        if (!item) return

        const modal = document.getElementById('historyDetailModal')
        
        modal.querySelector('.history-source').value = item.sourceText
        modal.querySelector('.history-target').value = item.targetText
        modal.querySelector('.history-time').textContent = new Date(item.timestamp).toLocaleString()
        
        const langInfo = `${this.getLangName(item.sourceLang)} → ${this.getLangName(item.targetLang)}`
        const langSpan = modal.querySelector('.history-langs')
        langSpan.textContent = langInfo
        langSpan.dataset.sourceLang = item.sourceLang
        langSpan.dataset.targetLang = item.targetLang

        modal.classList.add('show')
    }

    getLangName(code) {
        const langMap = {
            'zh': '中文',
            'en': '英语',
            'ja': '日语',
            'auto': '自动检测'
        }
        return langMap[code] || code
    }

    showToast(message) {
        const toast = document.createElement('div')
        toast.className = 'toast'
        toast.textContent = message
        document.body.appendChild(toast)
        
        setTimeout(() => {
            toast.remove()
        }, 2000)
    }

    add(sourceText, targetText, sourceLang, targetLang) {
        if (!this.enabled || !sourceText || !targetText) return

        const item = {
            id: Date.now(),
            sourceText,
            targetText,
            sourceLang,
            targetLang,
            timestamp: new Date().toISOString()
        }

        this.history.unshift(item)
        if (this.history.length > this.maxItems) {
            this.history.pop()
        }

        this.save()
        this.render()
    }

    clear() {
        this.history = []
        this.save()
        this.render()
    }

    save() {
        localStorage.setItem('translationHistory', JSON.stringify(this.history))
    }

    render() {
        const filteredHistory = this.filterHistory()
        const historyList = document.querySelector('.history-list')
        
        if (filteredHistory.length === 0) {
            historyList.innerHTML = `
                <div class="history-empty">
                    ${this.searchTerm || this.currentFilter !== 'all' ? 
                        '没有找到匹配的记录' : 
                        '暂无翻译记录'}
                </div>`
            return
        }

        historyList.innerHTML = filteredHistory.map(item => `
            <div class="history-item" data-id="${item.id}">
                <div class="time">${new Date(item.timestamp).toLocaleString()}</div>
                <div class="text">${item.sourceText.substring(0, 100)}${item.sourceText.length > 100 ? '...' : ''}</div>
                <div class="langs">${this.getLangName(item.sourceLang)} → ${this.getLangName(item.targetLang)}</div>
            </div>
        `).join('')
    }

    loadHistoryItem(id) {
        const item = this.history.find(h => h.id === parseInt(id))
        if (item) {
            document.getElementById('sourceText').value = item.sourceText
            document.getElementById('sourceLang').value = item.sourceLang
            document.getElementById('targetLang').value = item.targetLang
            document.getElementById('targetText').value = item.targetText
        }
    }

    filterHistory() {
        return this.history.filter(item => {
            // 搜索条件
            const matchesSearch = this.searchTerm === '' || 
                item.sourceText.toLowerCase().includes(this.searchTerm) ||
                item.targetText.toLowerCase().includes(this.searchTerm)

            // 语言筛选
            const langPair = `${item.sourceLang}-${item.targetLang}`
            const matchesFilter = this.currentFilter === 'all' || 
                this.currentFilter === langPair

            return matchesSearch && matchesFilter
        })
    }

    exportHistory() {
        const filteredHistory = this.filterHistory()
        const exportData = filteredHistory.map(item => ({
            timestamp: new Date(item.timestamp).toLocaleString(),
            sourceLang: this.getLangName(item.sourceLang),
            targetLang: this.getLangName(item.targetLang),
            sourceText: item.sourceText,
            targetText: item.targetText
        }))

        const csv = this.convertToCSV(exportData)
        const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' })
        const url = URL.createObjectURL(blob)
        
        const link = document.createElement('a')
        link.setAttribute('href', url)
        link.setAttribute('download', `translation_history_${new Date().toISOString().slice(0,10)}.csv`)
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
    }

    convertToCSV(data) {
        const headers = ['时间', '源语言', '目标语言', '原文', '译文']
        const rows = data.map(item => [
            item.timestamp,
            item.sourceLang,
            item.targetLang,
            `"${item.sourceText.replace(/"/g, '""')}"`,
            `"${item.targetText.replace(/"/g, '""')}"`
        ])
        return [headers, ...rows].map(row => row.join(',')).join('\n')
    }
}

// 导航管理
class NavigationManager {
    constructor() {
        this.init()
    }

    init() {
        this.bindEvents()
        this.showTab('translate')
    }

    bindEvents() {
        document.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', () => {
                this.showTab(item.dataset.tab)
            })
        })
    }

    showTab(tabId) {
        // 更新导航项状态
        document.querySelectorAll('.nav-item').forEach(item => {
            item.classList.toggle('active', item.dataset.tab === tabId)
        })

        // 更新内容区域
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.toggle('active', content.id === `${tabId}-tab`)
        })
    }
}

// 窗口控制
class WindowManager {
    constructor() {
        this.init()
    }

    init() {
        this.bindEvents()
        this.updateMaximizeButton()
    }

    bindEvents() {
        document.getElementById('minimize-btn').addEventListener('click', () => {
            ipcRenderer.send('window-minimize')
        })

        document.getElementById('maximize-btn').addEventListener('click', () => {
            ipcRenderer.send('window-maximize')
        })

        document.getElementById('close-btn').addEventListener('click', () => {
            ipcRenderer.send('window-close')
        })

        // 监听窗口状态变化
        ipcRenderer.on('window-state-change', (_, isMaximized) => {
            this.updateMaximizeButtonState(isMaximized)
        })
    }

    async updateMaximizeButton() {
        const isMaximized = await ipcRenderer.invoke('is-maximized')
        this.updateMaximizeButtonState(isMaximized)
    }

    updateMaximizeButtonState(isMaximized) {
        const maximizeBtn = document.getElementById('maximize-btn')
        if (isMaximized) {
            maximizeBtn.querySelector('svg').innerHTML = '<rect width="9" height="9" x="1.5" y="1.5" fill="none" stroke="currentColor" stroke-width="1.2"/>'
            maximizeBtn.setAttribute('title', '还原')
            document.body.classList.add('maximized')
        } else {
            maximizeBtn.querySelector('svg').innerHTML = '<rect width="9" height="9" x="1.5" y="1.5" fill="none" stroke="currentColor"/>'
            maximizeBtn.setAttribute('title', '最大化')
            document.body.classList.remove('maximized')
        }
    }
}

// 侧边栏大小调整功能
function initSidebarResize() {
    const sidebar = document.querySelector('.sidebar');
    const resizer = document.querySelector('.sidebar-resizer');
    const toggleBtn = document.querySelector('.sidebar-toggle');
    let isResizing = false;
    let startX;
    let startWidth;

    resizer.addEventListener('mousedown', initResize);

    function initResize(e) {
        isResizing = true;
        startX = e.clientX;
        startWidth = parseInt(window.getComputedStyle(sidebar).width, 10);
        
        resizer.classList.add('resizing');
        
        document.addEventListener('mousemove', resize);
        document.addEventListener('mouseup', stopResize);
    }

    function resize(e) {
        if (!isResizing) return;

        const width = startWidth + (e.clientX - startX);
        
        const minWidth = parseInt(getComputedStyle(document.documentElement)
            .getPropertyValue('--sidebar-min-width'));
        const maxWidth = parseInt(getComputedStyle(document.documentElement)
            .getPropertyValue('--sidebar-max-width'));
        
        if (width >= minWidth && width <= maxWidth) {
            sidebar.style.width = `${width}px`;
            document.documentElement.style.setProperty('--sidebar-width', `${width}px`);
            if (!sidebar.closest('.app-container').classList.contains('sidebar-collapsed')) {
                toggleBtn.style.left = `${width}px`;
            }
        }
    }

    function stopResize() {
        isResizing = false;
        resizer.classList.remove('resizing');
        
        document.removeEventListener('mousemove', resize);
        document.removeEventListener('mouseup', stopResize);
    }
}

// 侧边栏切换功能
function initSidebarToggle() {
    const appContainer = document.querySelector('.app-container');
    const toggleBtn = document.getElementById('toggle-sidebar');
    
    toggleBtn.addEventListener('click', () => {
        appContainer.classList.toggle('sidebar-collapsed');
        
        // 保存侧边栏状态到本地存储
        localStorage.setItem('sidebarCollapsed', appContainer.classList.contains('sidebar-collapsed'));
    });

    // 页面加载时恢复侧边栏状态
    const sidebarCollapsed = localStorage.getItem('sidebarCollapsed') === 'true';
    if (sidebarCollapsed) {
        appContainer.classList.add('sidebar-collapsed');
    }
}

// 初始化应用
document.addEventListener('DOMContentLoaded', () => {
    window.themeManager = new ThemeManager()
    window.historyManager = new HistoryManager()
    window.navigationManager = new NavigationManager()
    window.windowManager = new WindowManager()
    window.shortcutManager = new ShortcutManager()
    initSidebarResize();
    initSidebarToggle();
    
    // 添加模型测试功能
    const { modelService } = require('./js/model-service.js');
    console.log('Model service loaded:', modelService);  // 添加调试日志
    
    const testModelBtn = document.getElementById('testModel');
    if (testModelBtn) {
        console.log('Test model button found');
        testModelBtn.addEventListener('click', async () => {
            console.log('Test model button clicked');
            const infoElement = document.getElementById('modelInfo');
            infoElement.innerHTML = '<div class="model-info">正在获取模型信息...</div>';
            
            try {
                const modelInfo = await ipcRenderer.invoke('get-model-info');
                console.log('Model info received:', modelInfo);
                
                if (modelInfo) {
                    infoElement.innerHTML = `
                        <div class="model-info">
                            <div class="model-name">当前模型：${modelInfo.name}</div>
                            <div class="model-details">
                                <span>类型：${modelInfo.type}</span>
                                <span>参数量：${modelInfo.parameters}</span>
                                <span>量化：${modelInfo.quantization}</span>
                                <span>上下文长度：${modelInfo.context_length}</span>
                            </div>
                            <div class="model-status ${modelInfo.status === 'ready' ? 'status-ready' : 'status-loading'}">
                                状态：${modelInfo.status === 'ready' ? '就绪' : '加载中'}
                            </div>
                        </div>
                    `;
                } else {
                    infoElement.innerHTML = '<div class="model-error">无法获取模型信息</div>';
                }
            } catch (error) {
                console.error('Error testing model:', error);
                infoElement.innerHTML = '<div class="model-error">测试��败: ' + error.message + '</div>';
            }
        });
    } else {
        console.error('Test model button not found');
    }

    // 添加复制功能
    document.querySelector('.copy-message-btn').addEventListener('click', () => {
        const messageText = document.querySelector('.sidebar-message').value;
        if (messageText) {
            navigator.clipboard.writeText(messageText)
                .then(() => {
                    // 可以添加一个复制成功的提示
                    console.log('消息已复制');
                })
                .catch(err => {
                    console.error('复制失败:', err);
                });
        }
    });

    document.querySelector('.copy-gpu-btn').addEventListener('click', () => {
        const gpuText = document.getElementById('gpuStatus').value;
        if (gpuText) {
            navigator.clipboard.writeText(gpuText)
                .then(() => {
                    console.log('GPU状态已复制');
                })
                .catch(err => {
                    console.error('复制失败:', err);
                });
        }
    });
})
 