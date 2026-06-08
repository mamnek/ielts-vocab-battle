import json
import random

# Danh sách các chủ đề ngẫu nhiên để gán cho từ vựng
topics = ["academic", "business", "nature", "emotion", "daily"]
new_words = []

try:
    # Đọc file data.txt chứa hàng ngàn từ vựng
    with open('data.txt', 'r', encoding='utf-8') as f:
        for line in f:
            # Giả sử mỗi dòng có định dạng: english - tiếng việt
            # Ví dụ: hello - xin chào
            if '-' in line:
                parts = line.split('-', 1) # Tách làm 2 phần tại dấu gạch ngang đầu tiên
                en = parts[0].strip()
                vi = parts[1].strip()
                
                if en and vi:
                    new_words.append({
                        "en": en,
                        "vi": vi,
                        "topic": random.choice(topics)
                    })

    if new_words:
        # Tải file vocab.json hiện tại
        try:
            with open('vocab.json', 'r', encoding='utf-8') as f:
                current_data = json.load(f)
        except Exception:
            current_data = []
        
        # Nối 3000 từ mới vào kho hiện tại
        current_data.extend(new_words)
        
        # Ghi đè lại vào vocab.json
        with open('vocab.json', 'w', encoding='utf-8') as f:
            json.dump(current_data, f, ensure_ascii=False, indent=2)
            
        print(f"✅ Tuyệt vời! Đã nạp thành công {len(new_words)} từ vựng mới vào hệ thống.")
        print(f"📊 Kho từ vựng hiện tại của bạn đang có tổng cộng: {len(current_data)} từ.")
    else:
        print("❌ Không tìm thấy từ vựng nào hợp lệ. Đảm bảo file data.txt có định dạng: từ_tiếng_anh - nghĩa_tiếng_việt")
        
except FileNotFoundError:
    print("❌ Lỗi: Không tìm thấy file data.txt!")
    print("Vui lòng tạo một file tên là data.txt trong cùng thư mục, copy hàng ngàn từ vào đó rồi chạy lại.")
