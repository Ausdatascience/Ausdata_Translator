from transformers import NllbTokenizer, AutoModelForSeq2SeqLM
import torch

def test_translation():
    print("加载模型...")
    model_name = "facebook/nllb-200-distilled-600M"
    
    tokenizer = NllbTokenizer.from_pretrained(model_name)
    model = AutoModelForSeq2SeqLM.from_pretrained(model_name)
    
    # 检查设备
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"使用设备: {device}")
    model = model.to(device)
    
    # 测试翻译
    text = "Hello, how are you?"
    print(f"\n测试翻译文本: {text}")
    
    # 编码
    tokenizer.src_lang = "eng_Latn"  # 设置源语言为英语
    inputs = tokenizer(text, return_tensors="pt").to(device)
    
    # 生成翻译
    outputs = model.generate(
        **inputs,
        forced_bos_token_id=tokenizer.get_vocab()["zho_Hans"],  # 使用 get_vocab 方法获取语言 ID
        max_length=128,
        num_beams=5,
        length_penalty=1.0
    )
    
    # 解码翻译结果
    translation = tokenizer.batch_decode(outputs, skip_special_tokens=True)[0]
    print(f"翻译结果: {translation}")

if __name__ == "__main__":
    test_translation() 