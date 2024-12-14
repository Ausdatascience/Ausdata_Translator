const { contextBridge, ipcRenderer } = require('electron');

// 暴露安全的 API 到 window 对象
contextBridge.exposeInMainWorld('electron', {
    ipcRenderer: {
        send: (channel, data) => {
            ipcRenderer.send(channel, data);
        },
        on: (channel, func) => {
            ipcRenderer.on(channel, (event, ...args) => func(...args));
        },
        invoke: (channel, data) => {
            return ipcRenderer.invoke(channel, data);
        }
    },
    require: (module) => {
        return require(module);
    }
}); 