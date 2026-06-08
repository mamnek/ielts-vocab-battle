import json
import random
import re
import sys

try:
    import pdfplumber
except ImportError:
    print("❌ Thiếu thư viện pdfplumber. Hãy mở Terminal chạy lệnh: pip install pdfplumber")
    exit()

topics = ["academic", "business", "nature", "emotion", "daily"]
new_words = []

print("⏳ Đang quét dữ liệu văn bản từ file 3000.pdf... (Cực kỳ nhanh)")

# Fix lỗi hiển thị tiếng Việt trên Terminal Windows
sys.stdout.reconfigure(encoding='utf-8')

# Biểu thức chính quy (Regex) để nhận diện các dòng theo mẫu:
# [Số thứ tự] [Từ vựng] [Loại từ] [Phát âm] [Nghĩa]
# VD: 2 abandon v ə'bændən bỏ, từ bỏ
pattern = re.compile(r'^\d+\s+([a-zA-Z\s\-]+?)\s+(?:v|n|adj|adv|prep|pron|det|conj|exclam)(?:,\s*(?:v|n|adj|adv|prep|pron|det|conj|exclam))*\s+(?:\S+)\s+(.+)$')

try:
    with pdfplumber.open("3000.pdf") as pdf:
        for page_num, page in enumerate(pdf.pages):
            text = page.extract_text()
            if text:
                for line in text.split('\n'):
                    line = line.strip()
                    if not line or not line[0].isdigit():
                        continue
                        
                    match = pattern.match(line)
                    if match:
                        en = match.group(1).strip()
                        vi = match.group(2).strip()
                        
                        if en and vi:
                            new_words.append({
                                "en": en,
                                "vi": vi,
                                "topic": random.choice(topics)
                            })
                            
    if new_words:
        try:
            with open('vocab.json', 'r', encoding='utf-8') as f:
                current_data = json.load(f)
        except Exception:
            current_data = []
            
        existing_words = {item['en'].lower() for item in current_data}
        added_count = 0
        
        for w in new_words:
            if w['en'].lower() not in existing_words:
                current_data.append(w)
                existing_words.add(w['en'].lower())
                added_count += 1
                
        with open('vocab.json', 'w', encoding='utf-8') as f:
            json.dump(current_data, f, ensure_ascii=False, indent=2)
            
        print(f"✅ THÀNH CÔNG! Đã trích xuất và nạp {added_count} từ vựng từ PDF.")
        print(f"📊 Kho từ vựng hiện tại: {len(current_data)} từ.")
    else:
        print("❌ Không trích xuất được từ nào. Hãy kiểm tra lại định dạng file PDF.")

except FileNotFoundError:
    print("❌ Lỗi: Không tìm thấy file 3000.pdf!")
except Exception as e:
    print("❌ Có lỗi xảy ra:", str(e))
