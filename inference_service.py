import torch
import json
import sys
from transformers import NllbTokenizer, AutoModelForSeq2SeqLM
from typing import Dict

class TranslationService:
    def __init__(self):
        self.model_name = "facebook/nllb-200-distilled-600M"
        self.device_choice = "auto"  # 默认自动选择
        self.set_device()  # 初始化设备
        
        # 初始化状态 (使用英文)
        print(json.dumps({"status": "Loading model..."}))
        sys.stdout.flush()
        
        # 加载模型和分词器
        self.tokenizer = NllbTokenizer.from_pretrained(self.model_name)
        self.model = AutoModelForSeq2SeqLM.from_pretrained(self.model_name)
        self.model.to(self.device)
        
        # 语言代码映射
        self.lang_code_map = {
            "zh": "zho_Hans",  # 简体中文
            "en": "eng_Latn",  # 英语
            "ja": "jpn_Jpan",  # 日语
            "auto": "eng_Latn"  # 默认使用英语作为源语言
        }
        
        print(json.dumps({"status": "Ready"}))
        sys.stdout.flush()
        
        self.is_cancelled = False  # 添加取消标志

    def set_device(self):
        """设置设备并返回设备信息"""
        # 清理之前的缓存
        if hasattr(self, 'model') and torch.cuda.is_available():
            torch.cuda.empty_cache()

        if self.device_choice == "cpu":
            self.device = torch.device("cpu")
            # CPU 模式下禁用 CUDA 相关设置
            torch.backends.cudnn.enabled = False
            
        elif self.device_choice == "gpu":
            if torch.cuda.is_available():
                self.device = torch.device("cuda")
                # 强制 GPU 模式下的优化设置
                torch.backends.cudnn.enabled = True
                torch.backends.cudnn.benchmark = True
                torch.backends.cudnn.deterministic = False
                # 设置较大的 GPU 内存分配
                torch.cuda.set_per_process_memory_fraction(0.9)
            else:
                self.device = torch.device("cpu")
                print(json.dumps({
                    "status": "warning",
                    "message": "GPU不可用，已切换至CPU"
                }), flush=True)
            
        else:  # auto
            if torch.cuda.is_available():
                self.device = torch.device("cuda")
                # 自动模式下的适中优化设置
                torch.backends.cudnn.enabled = True
                torch.backends.cudnn.benchmark = False
                torch.backends.cudnn.deterministic = True
                # 设置适中的 GPU 内存分配
                torch.cuda.set_per_process_memory_fraction(0.7)
            else:
                self.device = torch.device("cpu")
        
        # 将模型移动到新设备
        if hasattr(self, 'model'):
            self.model.to(self.device)
            if self.device.type == 'cuda':
                torch.cuda.empty_cache()  # 再次清理缓存
        
        return {
            "status": "success",
            "message": f"已切换至 {self.device.type.upper()}",
            "device": self.device.type
        }

    def cancel_translation(self):
        """取消当前翻译任务"""
        self.is_cancelled = True
        print(json.dumps({
            "status": "cancelled",
            "message": "翻译已取消"
        }, ensure_ascii=False))
        sys.stdout.flush()

    def translate(self, text: str, source_lang: str, target_lang: str) -> Dict:
        try:
            self.is_cancelled = False  # 重置取消标志
            print(f"Translation started: {text} from {source_lang} to {target_lang}", file=sys.stderr)
            
            # 预处理文本：保留��结构
            paragraphs = text.split('\n')
            translated_paragraphs = []
            
            # 如果是自动检测语言，先检测第一段的语言
            if source_lang == "auto":
                first_text = next((p for p in paragraphs if p.strip()), "")
                has_chinese = any('\u4e00' <= char <= '\u9fff' for char in first_text)
                source_lang = "zh" if has_chinese else "en"
                print(f"Detected language: {source_lang}", file=sys.stderr)
            
            # 设置源语言和目标语言代码
            src_lang_code = self.lang_code_map[source_lang]
            tgt_lang_code = self.lang_code_map[target_lang]
            self.tokenizer.src_lang = src_lang_code
            forced_bos_token_id = self.tokenizer.get_vocab()[tgt_lang_code]
            
            for i, paragraph in enumerate(paragraphs):
                # 检查是否被取消
                if self.is_cancelled:
                    print(json.dumps({
                        "status": "cancelled",
                        "message": "翻译已取消",
                        "translation": "\n".join(translated_paragraphs),  # 返回已翻译的部分
                        "progress": {
                            "current": i,
                            "total": len(paragraphs),
                            "percentage": round(i / len(paragraphs) * 100, 1)
                        }
                    }, ensure_ascii=False))
                    sys.stdout.flush()
                    return None
                    
                if not paragraph.strip():
                    translated_paragraphs.append("")
                    self._send_partial_result(translated_paragraphs, i + 1, len(paragraphs))
                    continue
                    
                try:
                    # 在生成翻译前再次检查取消状态
                    if self.is_cancelled:
                        break
                    
                    # 对每个段落进行翻译
                    inputs = self.tokenizer(
                        paragraph.strip(),
                        return_tensors="pt",
                        padding=True,
                        truncation=True,
                        max_length=512
                    )
                    inputs = {k: v.to(self.device) for k, v in inputs.items()}
                    
                    # 生成翻译
                    generation_config = {
                        "do_sample": True,  # 改为 True 以启用采样模��
                        "temperature": 0.6,  # 保持温度参数不变
                        "max_length": 1024,
                        "num_beams": 1,
                        "top_p": 0.95
                    }
                    translated_tokens = self.model.generate(
                        **inputs,
                        forced_bos_token_id=forced_bos_token_id,
                        max_length=512,
                        min_length=10,
                        num_beams=8,
                        length_penalty=1.0,
                        temperature=0.6,
                        do_sample=False,
                        repetition_penalty=1.2,
                        early_stopping=True,
                        no_repeat_ngram_size=3
                    )
                    
                    # 在解码前再次检查取消状态
                    if self.is_cancelled:
                        break
                    
                    # 解码翻译结果
                    translation = self.tokenizer.batch_decode(translated_tokens, skip_special_tokens=True)[0]
                    translated_paragraphs.append(translation)
                    
                    # 发送部分翻译结果
                    self._send_partial_result(translated_paragraphs, i + 1, len(paragraphs))
                    
                except Exception as e:
                    if self.is_cancelled:
                        break
                    print(f"Error translating paragraph {i}: {str(e)}", file=sys.stderr)
                    translated_paragraphs.append(f"[翻译错误: {str(e)}]")
                
                # 再次检查是否被取消
                if self.is_cancelled:
                    break
            
            if self.is_cancelled:
                print(json.dumps({
                    "status": "cancelled",
                    "message": "翻译已取消",
                    "translation": "\n".join(translated_paragraphs),
                    "progress": {
                        "current": len(translated_paragraphs),
                        "total": len(paragraphs),
                        "percentage": round(len(translated_paragraphs) / len(paragraphs) * 100, 1)
                    }
                }, ensure_ascii=False))
                sys.stdout.flush()
                return None
            
            # 合并最终翻译结果
            final_translation = '\n'.join(translated_paragraphs)
            
            return {
                "status": "success",
                "translation": final_translation,
                "source_lang": source_lang,
                "target_lang": target_lang,
                "original_length": len(text),
                "translated_length": len(final_translation),
                "paragraphs_count": len(paragraphs),
                "is_final": True
            }
            
        except Exception as e:
            print(f"Translation error: {str(e)}", file=sys.stderr)
            return {
                "status": "error",
                "error": str(e),
                "source_lang": source_lang,
                "target_lang": target_lang
            }

    def _send_partial_result(self, translated_paragraphs: list, current: int, total: int):
        """发送部分翻译结果"""
        partial_translation = '\n'.join(translated_paragraphs)
        result = {
            "status": "partial",
            "translation": partial_translation,
            "progress": {
                "current": current,
                "total": total,
                "percentage": round(current / total * 100, 1)
            },
            "is_final": False
        }
        print(json.dumps(result, ensure_ascii=False))
        sys.stdout.flush()

    def start(self):
        while True:
            try:
                line = sys.stdin.readline().strip()
                if not line:
                    continue
                
                request = json.loads(line)
                print(f"Received request: {request}", file=sys.stderr)  # 添加调试输出
                
                # 处理获取模型信息的请求
                if request.get("command") == "get-model-info":
                    model_info = self.get_model_info()
                    print(json.dumps({
                        "type": "model-info",
                        "data": model_info
                    }, ensure_ascii=False), flush=True)
                    continue
                
                # 处理硬件切换请求
                if "hardware" in request and "text" not in request:
                    self.device_choice = request["hardware"]
                    result = self.set_device()
                    print(json.dumps(result, ensure_ascii=False))
                    sys.stdout.flush()
                    continue
                
                # 处理取消命令
                if request.get("command") == "cancel":
                    self.cancel_translation()
                    continue
                
                # 处理翻译请求
                if "text" in request:
                    result = self.translate(
                        request["text"],
                        request["sourceLang"],  # 确保这些字段名与 JavaScript 端一致
                        request["targetLang"]
                    )
                    
                    if result is not None:
                        print(json.dumps(result, ensure_ascii=False))
                        sys.stdout.flush()
                
            except Exception as e:
                print(json.dumps({
                    "status": "error",
                    "error": f"Request processing error: {str(e)}"
                }, ensure_ascii=False))
                sys.stdout.flush()

    def check_gpu_status(self):
        """检查 GPU 状态"""
        gpu_info = {
            "cuda_available": torch.cuda.is_available(),
            "device": str(self.device),
            "gpu_name": torch.cuda.get_device_name(0) if torch.cuda.is_available() else "N/A",
            "memory_allocated": f"{torch.cuda.memory_allocated(0)/1024**2:.2f} MB" if torch.cuda.is_available() else "N/A",
            "memory_reserved": f"{torch.cuda.memory_reserved(0)/1024**2:.2f} MB" if torch.cuda.is_available() else "N/A"
        }
        return gpu_info

    def get_model_info(self):
        """获取模型信息"""
        return {
            "name": self.model_name,
            "type": "Neural Machine Translation",
            "parameters": "600M",
            "quantization": "None",
            "context_length": 512,
            "status": "ready"
        }

if __name__ == "__main__":
    service = TranslationService()
    service.start() 