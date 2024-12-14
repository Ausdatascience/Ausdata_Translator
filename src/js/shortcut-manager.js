class ShortcutManager {
    constructor() {
        this.shortcuts = this.loadShortcuts();
        this.currentListener = null;
        this.listeningKeys = new Set();
        this.initUI();
    }

    // 默认快捷键配置
    get defaultShortcuts() {
        return {
            translate: 'Ctrl+Enter',
            cancel: 'Escape',
            copy: 'Ctrl+C'
        };
    }

    // 加载保存的快捷键设置
    loadShortcuts() {
        const saved = localStorage.getItem('shortcuts');
        return saved ? JSON.parse(saved) : this.defaultShortcuts;
    }

    // 保存快捷键设置
    saveShortcuts() {
        localStorage.setItem('shortcuts', JSON.stringify(this.shortcuts));
        this.updateUI();
    }

    // 初始化UI
    initUI() {
        // 初始化编辑按钮
        document.querySelectorAll('.shortcut-edit').forEach(button => {
            const action = button.dataset.action;
            button.querySelector('.shortcut-value').textContent = this.formatShortcut(this.shortcuts[action]);
            
            button.addEventListener('click', () => this.startListening(button));
        });

        // 初始化重置按钮
        document.querySelector('.reset-shortcuts').addEventListener('click', () => {
            if (confirm('确定要恢复默认快捷键设置吗？')) {
                this.shortcuts = {...this.defaultShortcuts};
                this.saveShortcuts();
            }
        });
    }

    // ���始监听快捷键
    startListening(button) {
        if (this.currentListener) {
            this.stopListening();
        }

        this.currentListener = button;
        this.listeningKeys.clear();
        button.classList.add('listening');
        button.querySelector('.shortcut-hint').textContent = '按下快捷键...';

        const handleKeyDown = (e) => {
            e.preventDefault();
            
            // 记录按下的键
            if (e.key === 'Control') this.listeningKeys.add('Ctrl');
            else if (e.key === 'Alt') this.listeningKeys.add('Alt');
            else if (e.key === 'Shift') this.listeningKeys.add('Shift');
            else if (!['Control', 'Alt', 'Shift'].includes(e.key)) {
                this.listeningKeys.add(this.formatKey(e.key));
            }
            
            // 更新显示
            const currentKeys = Array.from(this.listeningKeys).join(' + ');
            button.querySelector('.shortcut-value').textContent = currentKeys;
        };

        const handleKeyUp = (e) => {
            // 当抬起非修饰键时，完成快捷键设置
            if (!['Control', 'Alt', 'Shift'].includes(e.key)) {
                const shortcut = Array.from(this.listeningKeys).join('+');
                if (shortcut) {
                    this.setShortcut(button.dataset.action, shortcut);
                    this.stopListening();
                }
            } else {
                // 从集合中移除抬起的修饰键
                if (e.key === 'Control') this.listeningKeys.delete('Ctrl');
                if (e.key === 'Alt') this.listeningKeys.delete('Alt');
                if (e.key === 'Shift') this.listeningKeys.delete('Shift');
                
                // 更新显示
                const currentKeys = Array.from(this.listeningKeys).join(' + ');
                button.querySelector('.shortcut-value').textContent = currentKeys || '按下快捷键...';
            }
        };

        // 添加事件监听器
        document.addEventListener('keydown', handleKeyDown);
        document.addEventListener('keyup', handleKeyUp);
        
        // 保存引用以便后续移除
        button._handleKeyDown = handleKeyDown;
        button._handleKeyUp = handleKeyUp;
    }

    // 停止监听快捷键
    stopListening() {
        if (this.currentListener) {
            this.currentListener.classList.remove('listening');
            this.currentListener.querySelector('.shortcut-hint').textContent = '点击修改';
            document.removeEventListener('keydown', this.currentListener._handleKeyDown);
            document.removeEventListener('keyup', this.currentListener._handleKeyUp);
            this.currentListener = null;
            this.listeningKeys.clear();
        }
    }

    // 设置快捷键
    setShortcut(action, shortcut) {
        this.shortcuts[action] = shortcut;
        this.saveShortcuts();
    }

    // 格式化按键显示
    formatKey(key) {
        const keyMap = {
            'Enter': '↵',
            'Escape': 'Esc',
            'ArrowUp': '↑',
            'ArrowDown': '↓',
            'ArrowLeft': '←',
            'ArrowRight': '→',
            ' ': 'Space'
        };
        return keyMap[key] || key;
    }

    // 格式化快捷键显示
    formatShortcut(shortcut) {
        return shortcut.split('+').map(key => this.formatKey(key)).join(' + ');
    }

    // 更新UI显示
    updateUI() {
        document.querySelectorAll('.shortcut-edit').forEach(button => {
            const action = button.dataset.action;
            button.querySelector('.shortcut-value').textContent = 
                this.formatShortcut(this.shortcuts[action]);
        });
    }

    // 检查快捷键是否匹配
    matchShortcut(e, action) {
        const shortcut = this.shortcuts[action];
        const parts = shortcut.split('+');
        
        // 检查修饰键
        const modifiers = {
            'Ctrl': e.ctrlKey,
            'Alt': e.altKey,
            'Shift': e.shiftKey
        };

        // 检查每个部分是否匹配
        return parts.every(part => {
            if (part in modifiers) {
                return modifiers[part];
            }
            return e.key === part || this.formatKey(e.key) === part;
        });
    }
} 