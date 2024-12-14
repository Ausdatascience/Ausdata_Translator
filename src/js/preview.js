const { ipcRenderer } = require('electron');

document.getElementById('closeWindow').addEventListener('click', () => {
    ipcRenderer.send('close-preview');
});

document.getElementById('savePDF').addEventListener('click', () => {
    ipcRenderer.send('save-as-pdf');
});

document.getElementById('saveWord').addEventListener('click', () => {
    ipcRenderer.send('save-as-word');
});

// 接收预览内容并自动分页
ipcRenderer.on('preview-content', (event, content) => {
    const container = document.getElementById('previewContainer');
    container.innerHTML = ''; // 清空容器
    
    // 创建临时元素来测量内容高度
    const testPage = document.createElement('div');
    testPage.className = 'page';
    const testContent = document.createElement('div');
    testContent.style.whiteSpace = 'pre-wrap';
    testContent.style.lineHeight = '1.6';
    testContent.style.fontSize = '12pt';
    container.appendChild(testPage);
    testPage.appendChild(testContent);
    
    // A4 页面可用高度 (297mm - 40mm边距)
    const pageHeight = 257 * 3.7795275591; // 转换为像素 (1mm ≈ 3.7795275591px)
    
    // 分割内容
    const lines = content.split('\n');
    let currentPage = createNewPage();
    let currentHeight = 0;
    
    lines.forEach((line) => {
        // 测试添加这一行后的高度
        testContent.textContent += line + '\n';
        const newHeight = testContent.offsetHeight;
        
        // 如果超出页面高度，创建新页面
        if (newHeight > pageHeight) {
            currentPage = createNewPage();
            testContent.textContent = line + '\n';
            currentHeight = testContent.offsetHeight;
        }
        
        currentPage.textContent += line + '\n';
        currentHeight = newHeight;
    });
    
    // 移除测试元素
    container.removeChild(testPage);
});

// 创建新页面
function createNewPage() {
    const container = document.getElementById('previewContainer');
    const page = document.createElement('div');
    page.className = 'page';
    const content = document.createElement('div');
    content.id = 'previewContent';
    page.appendChild(content);
    container.appendChild(page);
    return content;
}

// 添加保存状态处理
ipcRenderer.on('save-status', (event, status) => {
    const toast = document.createElement('div');
    toast.className = 'save-toast';
    toast.textContent = status.message;
    toast.style.backgroundColor = status.success ? '#4CAF50' : '#F44336';
    
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.remove();
    }, 2000);
}); 