import socketio
import time
import json

# Khởi tạo 2 client mô phỏng 2 người chơi chạy song song
sio1 = socketio.Client()
sio2 = socketio.Client()

room_code = ""

# Tải bộ từ vựng để Bot lấy "phao" trả lời
with open('vocab.json', 'r', encoding='utf-8') as f:
    vocab = {item['en']: item['vi'] for item in json.load(f)}

@sio1.event
def connect():
    print("[Player 1] Đã kết nối! Đang tạo phòng...")
    sio1.emit('create_room', {'name': 'Bot_Pro_1'})

@sio1.on('room_created')
def on_room_created(data):
    global room_code
    room_code = data['room_code']
    print(f"[Player 1] Tạo phòng thành công! Mã phòng: {room_code}")
    # Gọi Player 2 tham gia phòng này
    sio2.connect('http://localhost:5000')

@sio2.event
def connect():
    print("[Player 2] Đã kết nối! Đang vào phòng...")
    sio2.emit('join_room', {'name': 'Bot_Pro_2', 'room_code': room_code})

@sio1.on('game_start')
def on_game_start(data):
    print("\n" + "="*30)
    print("🚀 TRẬN ĐẤU BẮT ĐẦU!")
    print("="*30)

@sio1.on('new_word')
def p1_new_word(data):
    word = data['word']
    print(f"\n[Server] Từ mới: {word} (15 giây)")
    answer = vocab.get(word, '')
    
    # Bot giả lập độ trễ suy nghĩ của con người (1.5 giây)
    time.sleep(1.5)
    print(f"[Player 1] Gửi đáp án: {answer}")
    sio1.emit('submit_answer', {'room_code': room_code, 'answer': answer})

@sio1.on('correct_answer')
def on_correct(data):
    players = data['players']
    print(f"✅ [Server] {data['winner']} trả lời ĐÚNG! Đáp án: {data['correct_answer']}")
    print(f"📊 Điểm số: {players[0]['name']} [{players[0]['score']}] - [{players[1]['score']}] {players[1]['name']}")

if __name__ == '__main__':
    # Đảm bảo Web server đang chạy ở terminal khác trước khi chạy file này
    sio1.connect('http://localhost:5000')
    try:
        sio1.wait()
    except KeyboardInterrupt:
        sio1.disconnect()
        sio2.disconnect()
        print("\nKết thúc test tự động.")
