from transformers import NllbTokenizer, AutoModelForSeq2SeqLM

def test_model_download():
    print("开始下载模型...")
    model_name = "facebook/nllb-200-distilled-600M"
    
    print("下载分词器...")
    tokenizer = NllbTokenizer.from_pretrained(model_name)
    
    print("下载模型...")
    model = AutoModelForSeq2SeqLM.from_pretrained(model_name)
    
    print("模型下载完成！")
    
    return tokenizer, model

if __name__ == "__main__":
    test_model_download() 