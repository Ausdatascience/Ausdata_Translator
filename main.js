const { app, BrowserWindow, ipcMain, dialog, BrowserView } = require('electron')
const path = require('path')
const { spawn } = require('child_process')
const { exec } = require('child_process');
const util = require('util');
const execAsync = util.promisify(exec);
const fs = require('fs');
const { Document, Paragraph, Packer } = require('docx');

global.pythonProcess = null;
let mainWindow
let previewWindow = null;

function createWindow() {
    const iconPath = process.platform === 'win32'
        ? path.join(__dirname, 'src/assets/logo.ico')
        : process.platform === 'darwin'
            ? path.join(__dirname, 'src/assets/logo.icns')
            : path.join(__dirname, 'src/assets/logo.png');

    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        minWidth: 900,
        minHeight: 600,
        frame: false,
        transparent: true,
        backgroundColor: '#00000000',
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            enableRemoteModule: true,
            devTools: true,
            webSecurity: true,
            allowRunningInsecureContent: false
        },
        ...(process.platform === 'win32' ? {
            roundedCorners: true
        } : {}),
        icon: iconPath
    })

    if (process.platform === 'win32') {
        mainWindow.setVibrancy('dark')
    }

    mainWindow.loadFile('src/index.html')

    if (process.env.NODE_ENV === 'development') {
        mainWindow.webContents.openDevTools()
    }

    // 窗口控制
    ipcMain.on('window-minimize', () => {
        mainWindow.minimize()
    })

    // 修改最大化/还原逻辑
    ipcMain.on('window-maximize', () => {
        if (mainWindow.isMaximized()) {
            mainWindow.unmaximize()  // 使用 unmaximize 替代 restore
        } else {
            mainWindow.maximize()
        }
        // 立即发送窗口状态
        mainWindow.webContents.send('window-state-change', mainWindow.isMaximized())
    })

    ipcMain.on('window-close', () => {
        mainWindow.close()
    })

    // 获取窗口状态
    ipcMain.handle('is-maximized', () => {
        return mainWindow.isMaximized()
    })

    // 监听窗口最大化事件
    mainWindow.on('maximize', () => {
        mainWindow.webContents.send('window-state-change', true)
    })

    // 监听窗口还原事件
    mainWindow.on('unmaximize', () => {
        mainWindow.webContents.send('window-state-change', false)
    })

    // 监听窗口大小变化
    mainWindow.on('resize', () => {
        mainWindow.webContents.send('window-state-change', mainWindow.isMaximized())
    })
}

// 启动 Python 推理服务
function startInferenceService() {
    console.log('Starting Python service with debug info...');
    
    // 检查 Python 是否可用
    try {
        const pythonVersionCheck = spawn('python', ['--version']);
        pythonVersionCheck.stdout.on('data', (data) => {
            console.log('Python version:', data.toString());
        });
    } catch (e) {
        console.error('Failed to check Python version:', e);
    }

    // 设置环境变量
    const env = {
        ...process.env,
        PYTHONIOENCODING: 'utf-8',
        PYTHONUTF8: '1',
        PYTHONUNBUFFERED: '1'
    };

    if (process.platform === 'win32') {
        env.PYTHONLEGACYWINDOWSSTDIO = '0';
    }

    // 检查文件是否存在
    const pythonScript = path.join(__dirname, 'inference_service.py');
    console.log('Looking for Python script at:', pythonScript);
    
    if (!require('fs').existsSync(pythonScript)) {
        console.error('Python script not found!');
        return;
    }

    console.log('Starting Python process...');
    global.pythonProcess = spawn('python', [pythonScript], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: env
    });
    
    // 添加进程事件处理
    global.pythonProcess.on('spawn', () => {
        console.log('Python process spawned');
    });

    global.pythonProcess.on('error', (err) => {
        console.error('Failed to start Python process:', err);
    });

    // 处理标准输出
    global.pythonProcess.stdout.on('data', (data) => {
        console.log('Python stdout:', data.toString('utf8'));
        try {
            // 分割多行输出并逐行解析
            const lines = data.toString('utf8').trim().split('\n');
            lines.forEach(line => {
                if (line.trim()) {
                    try {
                        const result = JSON.parse(line.trim());
                        console.log('Parsed result:', result);
                        mainWindow.webContents.send('translation-result', result);
                    } catch (parseError) {
                        console.error('Failed to parse line:', line);
                        console.error('Parse error:', parseError);
                    }
                }
            });
        } catch (e) {
            console.error('Failed to process Python output:', e);
            console.error('Raw data:', data.toString('utf8'));
        }
    });

    // 处理错误输出
    global.pythonProcess.stderr.on('data', (data) => {
        const errorMsg = data.toString('utf8');
        console.error('Python stderr:', errorMsg);
        
        // 忽略特定告信息
        if (errorMsg.includes('UserWarning') || 
            errorMsg.includes('do_sample') || 
            errorMsg.includes('Translation started:') || 
            errorMsg.includes('Detected language:')) {
            return;
        }
        
        mainWindow.webContents.send('translation-error', {
            status: 'error',
            error: errorMsg
        });
    });
}

// 处理翻译请求
ipcMain.on('translate-text', async (event, data) => {
    console.log('Translation request received in main process:', data);
    
    if (!global.pythonProcess) {
        console.error('Python process not running!');
        event.reply('translation-error', {
            status: 'error',
            error: 'Python 服务未运行，请重启应用'
        });
        return;
    }

    try {
        const jsonData = JSON.stringify(data) + '\n';
        console.log('Sending to Python process:', jsonData);
        global.pythonProcess.stdin.write(jsonData, 'utf8', (err) => {
            if (err) {
                console.error('Failed to write to Python process:', err);
                event.reply('translation-error', {
                    status: 'error',
                    error: '发送翻译请求失败: ' + err.message
                });
            } else {
                console.log('Data sent to Python successfully');
            }
        });
    } catch (e) {
        console.error('Error sending data to Python:', e);
        event.reply('translation-error', {
            status: 'error',
            error: '发送翻译请求失败: ' + e.message
        });
    }
});

// 处理取消翻译请求
ipcMain.on('cancel-translation', () => {
    if (global.pythonProcess) {
        // 发送取消信号到 Python 进程
        global.pythonProcess.stdin.write(JSON.stringify({ command: 'cancel' }) + '\n');
    }
});

// 添加IPC处理器
ipcMain.handle('get-gpu-status', async () => {
    try {
        console.log('Executing nvidia-smi...');
        const { stdout, stderr } = await execAsync('nvidia-smi --query-gpu=name,memory.used,memory.total,utilization.gpu,temperature.gpu --format=csv,noheader,nounits');
        
        if (stderr) {
            console.error('nvidia-smi stderr:', stderr);
        }
        
        const [name, memoryUsed, memoryTotal, utilization, temperature] = stdout.trim().split(',').map(item => item.trim());
        
        const result = {
            available: true,
            name,
            memoryUsed: parseInt(memoryUsed),
            memoryTotal: parseInt(memoryTotal),
            utilization: parseInt(utilization),
            temperature: parseInt(temperature)
        };
        
        console.log('GPU status:', result);
        return result;
    } catch (error) {
        console.error('Error getting GPU status:', error);
        return {
            available: false,
            error: error.message
        };
    }
});

ipcMain.on('open-preview', (event, content) => {
    if (previewWindow) {
        previewWindow.focus();
        return;
    }

    previewWindow = new BrowserWindow({
        width: 900,
        height: 1200,
        autoHideMenuBar: true,
        frame: true,
        transparent: false,
        icon: path.join(__dirname, 'src/assets/logo.ico'),
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        },
        title: '预览 - Ausdata Translator'
    });

    previewWindow.loadFile('src/preview.html');
    
    previewWindow.webContents.on('did-finish-load', () => {
        previewWindow.webContents.send('preview-content', content);
    });

    previewWindow.on('closed', () => {
        previewWindow = null;
    });
});

ipcMain.on('close-preview', () => {
    if (previewWindow) {
        previewWindow.close();
    }
});

ipcMain.on('save-as-pdf', async () => {
    if (!previewWindow) return;
    
    try {
        const { canceled, filePath } = await dialog.showSaveDialog(previewWindow, {
            defaultPath: 'translation.pdf',
            filters: [{ name: 'PDF文档', extensions: ['pdf'] }]
        });

        if (canceled || !filePath) {
            return;
        }

        // 使用 printToPDF 方法
        const data = await previewWindow.webContents.printToPDF({
            printBackground: true,
            pageSize: 'A4',
            margins: {
                marginType: 'none'
            }
        });

        // 使用 fs.writeFile 保存件
        require('fs').writeFile(filePath, data, (error) => {
            if (error) {
                console.error('保存PDF失败:', error);
                previewWindow.webContents.send('save-status', {
                    success: false,
                    message: '保存PDF失败: ' + error.message
                });
            } else {
                console.log('PDF保存成功:', filePath);
                previewWindow.webContents.send('save-status', {
                    success: true,
                    message: 'PDF保存成功'
                });
            }
        });

    } catch (error) {
        console.error('保存PDF过程中出错:', error);
        previewWindow.webContents.send('save-status', {
            success: false,
            message: '保存PDF失败: ' + error.message
        });
    }
});

ipcMain.on('save-as-word', async () => {
    if (!previewWindow) return;
    
    try {
        const { canceled, filePath } = await dialog.showSaveDialog(previewWindow, {
            defaultPath: 'translation.docx',
            filters: [{ name: 'Word文档', extensions: ['docx'] }]
        });

        if (canceled || !filePath) {
            return;
        }

        // 获取预览口中的文本内容
        const content = await previewWindow.webContents.executeJavaScript(`
            document.getElementById('previewContent').textContent
        `);

        // 创建Word文档
        const doc = new Document({
            sections: [{
                properties: {},
                children: content.split('\n').map(line => 
                    new Paragraph({
                        text: line,
                        spacing: {
                            line: 360, // 1.5倍行距
                            before: 200, // 段前间距
                            after: 200   // 段后间距
                        }
                    })
                )
            }]
        });

        // 生成Word文档
        const buffer = await Packer.toBuffer(doc);

        // 保存文件
        fs.writeFile(filePath, buffer, (error) => {
            if (error) {
                console.error('保存Word文档失败:', error);
                previewWindow.webContents.send('save-status', {
                    success: false,
                    message: '保存Word文档失败: ' + error.message
                });
            } else {
                console.log('Word文档保存成功:', filePath);
                previewWindow.webContents.send('save-status', {
                    success: true,
                    message: 'Word文档保存成功'
                });
            }
        });

    } catch (error) {
        console.error('保存Word文档过程中出错:', error);
        previewWindow.webContents.send('save-status', {
            success: false,
            message: '保存Word文档失败: ' + error.message
        });
    }
});

app.whenReady().then(() => {
    createWindow();
    startInferenceService();
});

app.on('window-all-closed', () => {
    if (global.pythonProcess) {
        global.pythonProcess.kill();
    }
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow()
    }
})

// 错误处理
process.on('uncaughtException', (error) => {
    console.error('未捕获的异常:', error)
})

process.on('unhandledRejection', (reason, promise) => {
    console.error('未处理的 Promise 拒绝:', reason)
})

ipcMain.handle('get-model-info', async () => {
    try {
        console.log('Handling get-model-info request');
        if (!global.pythonProcess) {
            console.error('Python process not available');
            return {
                name: "未知",
                type: "未知",
                parameters: "未知",
                quantization: "未知",
                context_length: 0,
                status: "error"
            };
        }

        return new Promise((resolve) => {
            // 创建一个超时处理
            const timeout = setTimeout(() => {
                console.log('Model info request timed out');
                resolve({
                    name: "超时",
                    type: "未知",
                    parameters: "未知",
                    quantization: "未知",
                    context_length: 0,
                    status: "timeout"
                });
            }, 5000);

            // 发送请求到 Python 进程
            global.pythonProcess.stdin.write(JSON.stringify({
                command: 'get-model-info'
            }) + '\n');

            // 处理响应
            const handler = (data) => {
                try {
                    const response = JSON.parse(data.toString());
                    console.log('Received response:', response);
                    
                    if (response.type === 'model-info') {
                        clearTimeout(timeout);
                        global.pythonProcess.stdout.removeListener('data', handler);
                        resolve(response.data);
                    }
                } catch (e) {
                    console.error('Error parsing model info response:', e);
                }
            };

            global.pythonProcess.stdout.on('data', handler);
        });
    } catch (error) {
        console.error('Error in get-model-info handler:', error);
        return {
            name: "错误",
            type: "错误",
            parameters: "错误",
            quantization: "错误",
            context_length: 0,
            status: "error"
        };
    }
}); 