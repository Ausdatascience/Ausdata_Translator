import os
from huggingface_hub import hf_hub_download
from pathlib import Path
import sys
import shutil

def cleanup_models_dir():
    """清理根目录下的模型文件"""
    models_dir = Path("models")
    if models_dir.exists():
        # 删除根目录下的模型文件
        for file in models_dir.glob("*.json"):
            file.unlink()
        for file in models_dir.glob("*.bin"):
            file.unlink()
        for file in models_dir.glob("*.model"):
            file.unlink()

def create_models_dir():
    """创建模型存储目录"""
    cleanup_models_dir()  # 首先清理旧文件
    models_dir = Path("models/facebook/nllb-200-distilled-600M")
    if not models_dir.exists():
        models_dir.mkdir(parents=True)
    return models_dir

def download_model(repo_id, filename, subfolder=None, total_files=None, current_file=None):
    """
    从 Hugging Face Hub 下载模型文件
    
    Args:
        repo_id: Hugging Face 模型仓库 ID
        filename: 要下载的文件名
        subfolder: 可选的子文件夹路径
        total_files: 总文件数
        current_file: 当前是第几个文件
    """
    try:
        models_dir = create_models_dir()
        
        # 计算并显示进度
        progress = f"[{current_file}/{total_files}]" if total_files else ""
        print(f"{progress} 正在下载: {filename}...", file=sys.stderr)
        
        # 下载文件
        downloaded_path = hf_hub_download(
            repo_id=repo_id,
            filename=filename,
            subfolder=subfolder,
            local_dir=models_dir,
            local_dir_use_symlinks=False
        )
        
        # 打印进度信息到标准错误流，结果信息到标准输出流
        print(f"{progress} 下载完成: {filename}", file=sys.stderr)
        print(f"成功下载模型文件: {downloaded_path}")
        
        # 计算总进度百分比
        if total_files:
            percentage = round((current_file / total_files) * 100)
            print(f"下载进度: {percentage}%", file=sys.stderr)
        
        return downloaded_path
    
    except Exception as e:
        print(f"下载失败: {str(e)}", file=sys.stderr)
        return None

def main():
    """主函数：下载所有需要的模型文件"""
    # NLLB-200 模型文件列表
    models_to_download = [
        {
            "repo_id": "facebook/nllb-200-distilled-600M",
            "filename": "config.json",
        },
        {
            "repo_id": "facebook/nllb-200-distilled-600M",
            "filename": "pytorch_model.bin",
        },
        {
            "repo_id": "facebook/nllb-200-distilled-600M",
            "filename": "sentencepiece.bpe.model",
        },
        {
            "repo_id": "facebook/nllb-200-distilled-600M",
            "filename": "tokenizer_config.json",
        },
        {
            "repo_id": "facebook/nllb-200-distilled-600M",
            "filename": "tokenizer.json",
        },
        {
            "repo_id": "facebook/nllb-200-distilled-600M",
            "filename": "special_tokens_map.json",
        }
    ]
    
    total_files = len(models_to_download)
    print(f"开始下载 NLLB-200 模型文件... 共{total_files}个文件", file=sys.stderr)
    
    for i, model in enumerate(models_to_download, 1):
        download_model(**model, total_files=total_files, current_file=i)
    
    print("模型下载完成！", file=sys.stderr)

if __name__ == "__main__":
    main() 