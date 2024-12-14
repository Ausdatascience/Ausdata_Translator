class SpeechService {
    constructor() {
        // 检查浏览器是否支持语音合成
        if (!('speechSynthesis' in window)) {
            console.error('浏览器不支持语音合成功能');
            return;
        }
        this.synthesis = window.speechSynthesis;
    }

    speak(text, sourceLang = 'auto') {
        if (!text) return {
            status: 'error',
            message: '没有可朗读的文本'
        };
        
        // 如果正在朗读，则停止
        if (this.synthesis.speaking) {
            this.synthesis.cancel();
            return {
                status: 'stopped',
                message: '已停止朗读'
            };
        }

        // 确定语言
        let lang;
        if (sourceLang === 'auto') {
            lang = this.detectLanguage(text);
            console.log('自动检测到的语言:', lang);
        } else {
            lang = sourceLang;
        }

        const utterance = new SpeechSynthesisUtterance(text);
        
        // 设置语音参数
        switch (lang) {
            case 'zh':
                utterance.lang = 'zh-CN';
                utterance.rate = 0.9;
                break;
            case 'en':
                utterance.lang = 'en-US';
                utterance.rate = 1.0;
                break;
            case 'ja':
                utterance.lang = 'ja-JP';
                utterance.rate = 0.9;
                break;
            default:
                utterance.lang = 'en-US';
                utterance.rate = 1.0;
        }

        utterance.pitch = 1.0;
        utterance.volume = 1.0;

        // 获取可用的语音列表
        const voices = this.synthesis.getVoices();
        console.log('可用的语音:', voices);
        
        // 选择合适的语音
        const voice = voices.find(v => v.lang.includes(utterance.lang));
        if (voice) {
            utterance.voice = voice;
            console.log('使用语音:', voice.name);
        }

        // 添加事件监听
        utterance.onstart = () => {
            console.log('开始朗读:', utterance.lang);
            return {
                status: 'speaking',
                message: `正在朗读... (${this.getLangName(lang)})`
            };
        };

        utterance.onend = () => {
            console.log('朗读完成');
            return {
                status: 'completed',
                message: '朗读完成'
            };
        };

        utterance.onerror = (event) => {
            console.error('朗读错误:', event);
            return {
                status: 'error',
                message: `朗读错误: ${event.error}`
            };
        };

        // 开始朗读
        this.synthesis.speak(utterance);
        
        return {
            status: 'speaking',
            message: `正在朗读... (${this.getLangName(lang)})`
        };
    }

    // 语言检测函数
    detectLanguage(text) {
        // 检测中文字符（包括标点符号）
        const chineseRegex = /[\u4e00-\u9fff\u3000-\u303f\uff00-\uff60]/;
        // 检测日文字符（平假名、片假名、汉字和日文标点）
        const japaneseRegex = /[\u3040-\u309f\u30a0-\u30ff\u4e00-\u9faf\u3000-\u303f]/;
        // 检测英文字符（包括标点符号）
        const englishRegex = /[a-zA-Z0-9\u0020-\u007F]/;

        let chineseCount = 0;
        let japaneseCount = 0;
        let englishCount = 0;

        for (let char of text) {
            if (chineseRegex.test(char)) chineseCount++;
            if (japaneseRegex.test(char)) japaneseCount++;
            if (englishRegex.test(char)) englishCount++;
        }

        const total = chineseCount + japaneseCount + englishCount;
        if (total === 0) return 'en';

        const chineseRatio = chineseCount / total;
        const japaneseRatio = japaneseCount / total;
        const englishRatio = englishCount / total;

        const threshold = 0.5;

        if (chineseRatio > threshold) return 'zh';
        if (japaneseRatio > threshold) return 'ja';
        if (englishRatio > threshold) return 'en';

        const maxRatio = Math.max(chineseRatio, japaneseRatio, englishRatio);
        if (maxRatio === chineseRatio) return 'zh';
        if (maxRatio === japaneseRatio) return 'ja';
        return 'en';
    }

    getLangName(code) {
        const langMap = {
            'zh': '中文',
            'en': '英语',
            'ja': '日语',
            'auto': '自动检测'
        };
        return langMap[code] || code;
    }
}

// 导出服务实例
window.speechService = new SpeechService(); 