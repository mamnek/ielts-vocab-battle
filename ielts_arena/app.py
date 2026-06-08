from flask import Flask, render_template, request
from flask_socketio import SocketIO, emit, join_room, leave_room
import json
import random
import string
import threading
import os
import difflib

app = Flask(__name__)
app.config['SECRET_KEY'] = 'ielts-secret-key-prod-ready'

# Khởi tạo SocketIO dùng threading (tương thích hoàn hảo với Python 3.13)
socketio = SocketIO(app, async_mode='threading', cors_allowed_origins="*")

# Tải dữ liệu từ vựng
with open('vocab.json', 'r', encoding='utf-8') as f:
    vocab_list = json.load(f)

# Biến lưu trữ trạng thái các phòng
rooms = {}

# Quản lý bộ từ vựng tự tạo
CUSTOM_VOCAB_FILE = 'custom_vocabs.json'
if not os.path.exists(CUSTOM_VOCAB_FILE):
    with open(CUSTOM_VOCAB_FILE, 'w', encoding='utf-8') as f:
        json.dump({}, f)

def load_custom_vocabs():
    with open(CUSTOM_VOCAB_FILE, 'r', encoding='utf-8') as f:
        return json.load(f)

def save_custom_vocabs(data):
    with open(CUSTOM_VOCAB_FILE, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

def remove_accents(text):
    s1 = u'ÀÁÂÃÈÉÊÌÍÒÓÔÕÙÚÝàáâãèéêìíòóôõùúýĂăĐđĨĩŨũƠơƯưẠạẢảẤấẦầẨẩẪẫẬậẮắẰằẲẳẴẵẶặẸẹẺẻẼẽẾếỀềỂểỄễỆệỈỉỊịỌọỎỏỐốỒồỔổỖỗỘộỚớỜờỞởỠỡỢợỤụỦủỨứỪừỬửỮữỰựỲỳỴỵỶỷỸỹ'
    s0 = u'AAAAEEEIIOOOOUUYaaaaeeeiioooouuyAaDdIiUuOoUuAaAaAaAaAaAaAaAaAaAaAaAaEeEeEeEeEeEeEeEeIiIiOoOoOoOoOoOoOoOoOoOoOoOoUuUuUuUuUuUuUuUuYyYyYyYy'
    s = ''
    for c in text:
        if c in s1:
            s += s0[s1.index(c)]
        else:
            s += c
    return s

def check_answer(user_ans, correct_ans):
    u = remove_accents(user_ans.strip().lower())
    c = remove_accents(correct_ans.strip().lower())
    
    if u == c: return True
    
    # Cho phép gõ thiếu từ (chỉ cần chứa từ khóa chính, độ dài >= 3)
    if len(u) >= 3 and (u in c or c in u): return True
    
    # Tính toán độ giống nhau, nếu đúng trên 80% (sai 1-2 ký tự đánh máy) thì vẫn chấp nhận là đúng
    ratio = difflib.SequenceMatcher(None, u, c).ratio()
    return ratio >= 0.80

def generate_room_code():
    return ''.join(random.choices(string.ascii_uppercase + string.digits, k=6))

@app.route('/')
def index():
    return render_template('index.html')

# === CÁC SỰ KIỆN SOCKET.IO ===

@socketio.on('create_room')
def on_create_room(data):
    player_name = data.get('name', 'Player 1')
    vocab_type = data.get('vocab_type', 'default')
    custom_set_id = data.get('custom_set_id', '').upper()
    play_mode = data.get('play_mode', 'multi')
    vocab_topic = data.get('vocab_topic', 'all')
    
    try:
        question_count = int(data.get('question_count', 10))
    except:
        question_count = 10
    
    room_vocab = vocab_list
    if vocab_type == 'custom':
        vocabs = load_custom_vocabs()
        if custom_set_id in vocabs:
            room_vocab = vocabs[custom_set_id]
        else:
            emit('error', {'message': 'Mã bộ từ vựng không tồn tại!'})
            return
        total_questions = len(room_vocab)
    else:
        # Lọc danh sách mặc định theo topic
        filtered_vocab = []
        for w in room_vocab:
            match_topic = (vocab_topic == 'all') or (w.get('topic') == vocab_topic)
            if match_topic:
                filtered_vocab.append(w)
                
        if not filtered_vocab:
            emit('error', {'message': 'Không có từ vựng nào thuộc Chủ đề này!'})
            return
            
        room_vocab = filtered_vocab
        total_questions = question_count
            
    room_code = generate_room_code()
    
    # Khởi tạo state cho phòng
    rooms[room_code] = {
        'players': {
            request.sid: {'name': player_name, 'score': 0}
        },
        'vocab': room_vocab,
        'used_words': [],
        'current_word': None,
        'answered': False,
        'round_id': 0,
        'current_question': 0,
        'total_questions': total_questions,
        'mode': play_mode,
        'lock': threading.Lock() # Khóa an toàn chống Race Condition
    }
    
    join_room(room_code)
    
    if play_mode == 'single':
        emit('room_joined', {'room_code': room_code})
        players_data = list(rooms[room_code]['players'].values())
        emit('game_start', {'players': players_data}, room=room_code)
        socketio.start_background_task(next_word, room_code)
    else:
        emit('room_created', {'room_code': room_code})

@socketio.on('join_room')
def on_join_room(data):
    player_name = data.get('name', 'Player 2')
    room_code = data.get('room_code', '').upper()
    
    if room_code not in rooms:
        emit('error', {'message': 'Phòng không tồn tại!'})
        return
        
    room = rooms[room_code]
    if len(room['players']) >= 2:
        emit('error', {'message': 'Phòng đã đầy!'})
        return
        
    # Thêm người chơi 2 vào phòng
    room['players'][request.sid] = {'name': player_name, 'score': 0}
    join_room(room_code)
    
    emit('room_joined', {'room_code': room_code})
    
    players_data = list(room['players'].values())
    # Gửi sự kiện bắt đầu game tới cả 2 người
    socketio.emit('game_start', {'players': players_data}, room=room_code)
    
    # Kích hoạt vòng đấu đầu tiên
    socketio.start_background_task(next_word, room_code)

def next_word(room_code):
    if room_code not in rooms: return
    room = rooms[room_code]
    
    with room['lock']:
        room['current_question'] += 1
        
        # Nếu đã chơi hết số câu thì kết thúc game
        if room['current_question'] > room['total_questions']:
            players_data = list(room['players'].values())
            players_data.sort(key=lambda x: x['score'], reverse=True)
            socketio.emit('game_over', {'players': players_data}, room=room_code)
            
            def remove_room():
                if room_code in rooms:
                    del rooms[room_code]
            socketio.start_background_task(remove_room)
            return

        # Lọc ra các từ chưa được sử dụng
        room_vocab = room.get('vocab', vocab_list)
        available = [w for w in room_vocab if w['en'] not in room['used_words']]
        if not available:
            # Tránh lặp lại từ vừa ra ở chu kỳ trước
            last_word = room['current_word']['en'] if room['current_word'] else None
            room['used_words'] = [last_word] if last_word else []
            available = [w for w in room_vocab if w['en'] not in room['used_words']]
            
            # Fallback nếu bộ từ vựng chỉ có 1 từ
            if not available:
                available = room_vocab
            
        word_obj = random.choice(available)
        room['used_words'].append(word_obj['en'])
        room['current_word'] = word_obj
        room['answered'] = False
        room['round_id'] += 1 # Tăng ID vòng đấu để quản lý timer độc lập
        current_round = room['round_id']
        current_q = room['current_question']
        total_q = room['total_questions']
        
    # Emit từ tiếng Anh cho cả 2 client
    socketio.emit('new_word', {
        'word': word_obj['en'], 
        'time': 15,
        'current_q': current_q,
        'total_q': total_q
    }, room=room_code)
    
    # Bắt đầu luồng đếm ngược thời gian
    socketio.start_background_task(word_timer, room_code, current_round)

def word_timer(room_code, round_id):
    socketio.sleep(15) # Chờ 15s
    
    if room_code not in rooms: return
    room = rooms[room_code]
    
    with room['lock']:
        # Nếu đã qua 15s, vẫn ở round cũ và chưa ai trả lời đúng
        if room['round_id'] == round_id and not room['answered']:
            room['answered'] = True # Khóa không cho nhận đáp án nữa
            socketio.emit('timeout', {'correct_answer': room['current_word']['vi']}, room=room_code)
            
            # Đợi 2 giây rồi tự động qua từ mới
            socketio.start_background_task(delayed_next_word, room_code)

def delayed_next_word(room_code):
    socketio.sleep(2)
    next_word(room_code)

@socketio.on('submit_answer')
def on_submit_answer(data):
    room_code = data.get('room_code')
    # Tiền xử lý đáp án: Chuyển chữ thường, xóa khoảng trắng đầu/cuối
    answer = data.get('answer', '').strip().lower()
    
    if room_code not in rooms: return
    room = rooms[room_code]
    
    # --- LOGIC XỬ LÝ RACE CONDITION ---
    # Sử dụng Block Lock để đảm bảo chỉ có 1 request được kiểm tra và cộng điểm tại 1 thời điểm
    with room['lock']:
        # Nếu đã có người trả lời đúng trước đó (trong cùng mili-giây) thì bỏ qua request này
        if room['answered'] or room['current_word'] is None:
            return 
            
        correct_answer = room['current_word']['vi'].strip().lower()
        
        if check_answer(answer, correct_answer):
            # Gán cờ hiệu thành True. Các request chậm hơn dù 1ms bị chặn lại bởi if phía trên.
            room['answered'] = True
            room['players'][request.sid]['score'] += 10
            
            players_data = list(room['players'].values())
            winner_name = room['players'][request.sid]['name']
            
            socketio.emit('correct_answer', {
                'winner': winner_name,
                'players': players_data,
                'correct_answer': room['current_word']['vi']
            }, room=room_code)
            
            socketio.start_background_task(delayed_next_word, room_code)
        else:
            emit('wrong_answer', {'message': 'Sai rồi'})

@socketio.on('disconnect')
def on_disconnect():
    for room_code, room in list(rooms.items()):
        if request.sid in room['players']:
            del room['players'][request.sid]
            socketio.emit('player_disconnected', room=room_code)
            # Dọn dẹp phòng trống
            if len(room['players']) == 0:
                del rooms[room_code]
            break

@socketio.on('save_vocab_set')
def on_save_vocab_set(data):
    pairs = data.get('pairs', [])
    if len(pairs) < 3:
        emit('vocab_save_error', {'message': 'Cần ít nhất 3 cặp từ!'})
        return
        
    set_id = ''.join(random.choices(string.ascii_uppercase + string.digits, k=5))
    
    formatted_pairs = []
    for p in pairs:
        en = p.get('en', '').strip()
        vi = p.get('vi', '').strip()
        if en and vi:
            formatted_pairs.append({'en': en, 'vi': vi})
            
    if len(formatted_pairs) < 3:
        emit('vocab_save_error', {'message': 'Vui lòng điền đầy đủ tiếng Anh và Việt (ít nhất 3 từ)!'})
        return
        
    vocabs = load_custom_vocabs()
    vocabs[set_id] = formatted_pairs
    save_custom_vocabs(vocabs)
    
    emit('vocab_saved', {'set_id': set_id})

if __name__ == '__main__':
    # Sẵn sàng triển khai Render: Lấy cổng động từ biến môi trường
    port = int(os.environ.get('PORT', 5000))
    socketio.run(app, host='0.0.0.0', port=port, allow_unsafe_werkzeug=True)
