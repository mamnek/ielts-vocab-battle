from flask import Flask, render_template, request, session, redirect, url_for
from flask_socketio import SocketIO, emit, join_room, leave_room
from pymongo import MongoClient
import json
import random
import string
import threading
import os
import difflib
import time

def get_srs_delay(level):
    delays = {
        0: 0,
        1: 86400,          # 1 ngày
        2: 86400 * 3,      # 3 ngày
        3: 86400 * 7,      # 7 ngày
        4: 86400 * 30      # 30 ngày
    }
    return time.time() + delays.get(level, 86400 * 30)

app = Flask(__name__)
app.config['SECRET_KEY'] = 'ielts-secret-key-prod-ready'

# --- MONGODB SETUP ---
MONGO_URI = "mongodb+srv://lekinhbaochau_db_user:lHJyYGxwn0VqdTrr@cluster0.u9joaox.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0"
try:
    mongo_client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=5000)
    db = mongo_client['ielts_arena']
    users_collection = db['users']
    print("✅ Connected to MongoDB successfully!")
except Exception as e:
    print("❌ Could not connect to MongoDB:", e)
    users_collection = None

# Khởi tạo SocketIO dùng threading (tương thích hoàn hảo với Python 3.13)
socketio = SocketIO(app, async_mode='threading', cors_allowed_origins="*")

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# Tải dữ liệu từ vựng
VOCAB_FILE_PATH = os.path.join(BASE_DIR, 'vocab.json')
with open(VOCAB_FILE_PATH, 'r', encoding='utf-8') as f:
    vocab_list = json.load(f)

COLLOC_FILE_PATH = os.path.join(BASE_DIR, 'collocations.json')
with open(COLLOC_FILE_PATH, 'r', encoding='utf-8') as f:
    collocations_raw = json.load(f)
    colloc_list = [{'en': w['answer'], 'vi': w['vi'], 'sentence': w['sentence'], 'options': w['options']} for w in collocations_raw]


# Biến lưu trữ trạng thái các phòng
rooms = {}

# Quản lý bộ từ vựng tự tạo
CUSTOM_VOCAB_FILE = os.path.join(BASE_DIR, 'custom_vocabs.json')
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

# === CÁC ROUTES CHO ADMIN ===
@app.route('/admin', methods=['GET', 'POST'])
def admin_panel():
    if request.method == 'POST':
        pwd = request.form.get('password')
        if pwd == 'admin123': # Mật khẩu siêu đơn giản
            session['admin_logged_in'] = True
            return redirect(url_for('admin_panel'))
        return "Sai mật khẩu!", 401
        
    if not session.get('admin_logged_in'):
        return '''
        <body style="background: #0f172a; color: white; font-family: sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0;">
            <form method="post" style="background: #1e293b; padding: 40px; border-radius: 12px; text-align: center; box-shadow: 0 10px 25px rgba(0,0,0,0.5);">
                <h2 style="color: #3b82f6; margin-bottom: 20px;">IELTS Arena Admin</h2>
                <input type="password" name="password" placeholder="Mật khẩu Admin" style="padding: 12px; width: 250px; border-radius: 8px; border: 1px solid #334155; background: #0f172a; color: white; outline: none; margin-bottom: 15px;" required><br>
                <button type="submit" style="padding: 12px 30px; background: #3b82f6; color: white; border: none; border-radius: 8px; cursor: pointer; font-weight: bold; width: 100%;">Đăng Nhập</button>
            </form>
        </body>
        '''
        
    users = []
    if users_collection is not None:
        users = list(users_collection.find().sort('elo', -1))
        
    active_rooms = []
    for code, room in rooms.items():
        players = [p['name'] for p in room['players'].values() if p.get('connected')]
        active_rooms.append({'code': code, 'mode': room.get('mode', 'multi'), 'players': players})
        
    return render_template('admin.html', users=users, active_rooms=active_rooms)

@app.route('/admin/action', methods=['POST'])
def admin_action():
    if not session.get('admin_logged_in'): return "Unauthorized", 401
    if users_collection is None: return "DB error", 500
    
    action = request.form.get('action')
    user_id = request.form.get('user_id')
    
    if action == 'ban':
        users_collection.update_one({'_id': user_id}, {'$set': {'banned': True}})
    elif action == 'unban':
        users_collection.update_one({'_id': user_id}, {'$set': {'banned': False}})
    elif action == 'set_elo':
        try:
            new_elo = int(request.form.get('elo', 0))
            users_collection.update_one({'_id': user_id}, {'$set': {'elo': new_elo}})
        except: pass
    elif action == 'delete':
        users_collection.delete_one({'_id': user_id})
    elif action == 'make_admin':
        users_collection.update_one({'_id': user_id}, {'$set': {'is_admin': True}})
    elif action == 'remove_admin':
        users_collection.update_one({'_id': user_id}, {'$set': {'is_admin': False}})
        
    return redirect(url_for('admin_panel'))

# === CÁC SỰ KIỆN SOCKET.IO ===

@socketio.on('create_room')
def on_create_room(data):
    player_name = data.get('name', 'Player 1')
    vocab_type = data.get('vocab_type', 'default')
    custom_set_id = data.get('custom_set_id', '').upper()
    play_mode = data.get('play_mode', 'multi')
    q_type = data.get('q_type', 'en-vi')
    vocab_topic = data.get('vocab_topic', 'all')
    
    try:
        question_count = int(data.get('question_count', 10))
    except:
        question_count = 10
    
    session_id = data.get('session_id', request.sid)
    elo = int(data.get('elo', 0))
    
    if vocab_type == 'custom':
        custom_vocab_data = data.get('custom_vocab_data', [])
        if not custom_vocab_data and custom_set_id:
            vocabs = load_custom_vocabs()
            if custom_set_id in vocabs:
                custom_vocab_data = vocabs[custom_set_id]
        if not custom_vocab_data:
            emit('error', {'message': 'Không tìm thấy dữ liệu bộ từ vựng hoặc mã không hợp lệ!'})
            return
        room_vocab = custom_vocab_data
        total_questions = len(room_vocab)
    elif vocab_type == 'mistakes':
        if users_collection is not None:
            db_user = users_collection.find_one({'_id': session_id})
            if not db_user or not db_user.get('mistakes'):
                emit('error', {'message': 'Tuyệt vời! Bạn không có từ vựng nào sai cả. Hãy chơi thêm để thử thách nhé.'})
                return
            
            now = time.time()
            due_words = []
            for k, w in db_user['mistakes'].items():
                if w.get('next_review', 0) <= now:
                    due_words.append(w)
            
            if not due_words:
                emit('error', {'message': 'Các từ sai của bạn chưa đến hạn ôn tập! Não bộ vẫn đang nhớ tốt, hãy quay lại vào ngày mai nhé.'})
                return
                
            room_vocab = due_words
            total_questions = min(question_count, len(room_vocab))
        else:
            emit('error', {'message': 'Database chưa kết nối!'})
            return
    else:
        if q_type == 'collocation':
            room_vocab = colloc_list.copy()
            total_questions = min(question_count, len(room_vocab))
        else:
            # Lọc danh sách mặc định theo topic
            room_vocab = [w for w in vocab_list if vocab_topic == 'all' or w.get('topic') == vocab_topic]
            if not room_vocab:
                emit('error', {'message': 'Không có từ vựng nào thuộc Chủ đề này!'})
                return
            total_questions = question_count
            
    room_code = generate_room_code()
    
    # Kiểm tra DB
    if users_collection is not None:
        db_user = users_collection.find_one({'_id': session_id})
        if db_user:
            if db_user.get('banned'):
                emit('error', {'message': 'Tài khoản của bạn đã bị Admin cấm tham gia!'})
                return
            # Dùng Elo chính thức từ Database
            elo = db_user.get('elo', 0)
            is_admin = db_user.get('is_admin', False)
            users_collection.update_one({'_id': session_id}, {'$set': {'name': player_name}})
        else:
            # Lưu user mới
            users_collection.update_one(
                {'_id': session_id},
                {'$set': {'name': player_name, 'elo': elo, 'banned': False, 'is_admin': False}},
                upsert=True
            )
            is_admin = False
        # Gửi Elo chuẩn về lại cho Client để đồng bộ màn hình
        emit('sync_data', {'elo': elo, 'is_admin': is_admin, 'name': db_user.get('name') if db_user else player_name})
    
    # Khởi tạo state cho phòng
    rooms[room_code] = {
        'players': {
            session_id: {'name': player_name, 'score': 0, 'sid': request.sid, 'connected': True, 'elo': elo, 'user_id': session_id}
        },
        'vocab': room_vocab,
        'used_words': [],
        'current_word': None,
        'answered': False,
        'round_id': 0,
        'current_question': 0,
        'total_questions': total_questions,
        'mode': play_mode,
        'q_type': q_type,
        'vocab_type': vocab_type,
        'sync_answers': {},
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
        max_players = 2
        if play_mode in ['multi3', 'sync3']:
            max_players = 3
        socketio.emit('waiting_update', {'current': 1, 'max': max_players}, room=room_code)

@socketio.on('join_room')
def on_join_room(data):
    player_name = data.get('name', 'Player 2')
    room_code = data.get('room_code', '').upper()
    session_id = data.get('session_id', request.sid)
    elo = int(data.get('elo', 0))
    
    # Kiểm tra DB
    if users_collection is not None:
        db_user = users_collection.find_one({'_id': session_id})
        if db_user:
            if db_user.get('banned'):
                emit('error', {'message': 'Tài khoản của bạn đã bị Admin cấm tham gia!'})
                return
            # Dùng Elo chính thức từ Database
            elo = db_user.get('elo', 0)
            is_admin = db_user.get('is_admin', False)
            users_collection.update_one({'_id': session_id}, {'$set': {'name': player_name}})
        else:
            users_collection.update_one(
                {'_id': session_id},
                {'$set': {'name': player_name, 'elo': elo, 'banned': False, 'is_admin': False}},
                upsert=True
            )
            is_admin = False
        # Gửi Elo chuẩn về lại cho Client
        emit('sync_data', {'elo': elo, 'is_admin': is_admin, 'name': db_user.get('name') if db_user else player_name})
    
    if room_code not in rooms:
        emit('error', {'message': 'Phòng không tồn tại hoặc đã hết hạn!'})
        return
        
    room = rooms[room_code]
    active_players = [p for p in room['players'].values() if p.get('connected', True)]
    
    # Xác định số người chơi tối đa
    max_players = 2
    if room.get('mode') in ['multi3', 'sync3']:
        max_players = 3
    elif room.get('mode') == 'single':
        max_players = 1
    
    if len(active_players) >= max_players and session_id not in room['players']:
        emit('error', {'message': 'Phòng đã đầy!'})
        return
        
    # Thêm hoặc cập nhật người chơi trong phòng
    if session_id not in room['players']:
        room['players'][session_id] = {'name': player_name, 'score': 0, 'sid': request.sid, 'connected': True, 'elo': elo, 'user_id': session_id}
    else:
        room['players'][session_id]['sid'] = request.sid
        room['players'][session_id]['connected'] = True
        room['players'][session_id]['elo'] = elo
        
    join_room(room_code)
    
    emit('room_joined', {'room_code': room_code})
    socketio.emit('waiting_update', {'current': len(room['players']), 'max': max_players}, room=room_code)
    
    # Chỉ bắt đầu game nếu đủ người và game chưa bắt đầu (vòng 0)
    if len(room['players']) >= max_players and room['round_id'] == 0:
        players_data = list(room['players'].values())
        socketio.emit('game_start', {'players': players_data}, room=room_code)
        socketio.start_background_task(next_word, room_code)

@socketio.on('reconnect_session')
def on_reconnect_session(data):
    room_code = data.get('room_code', '').upper()
    session_id = data.get('session_id')
    
    if room_code in rooms and session_id in rooms[room_code]['players']:
        room = rooms[room_code]
        room['players'][session_id]['sid'] = request.sid
        room['players'][session_id]['connected'] = True
        join_room(room_code)
        
        if room['round_id'] > 0:
            players_data = list(room['players'].values())
            emit('game_start', {'players': players_data})
            
            if room['current_word'] and not room['answered']:
                current_qt = room.get('current_q_type', 'en-vi')
                display_word = room['current_word']['vi'] if current_qt == 'vi-en' else room['current_word']['en']
                
                # Nếu là dạng đục lỗ (collocation), hiển thị câu đục lỗ
                if 'sentence' in room['current_word']:
                    display_word = room['current_word']['sentence']
                    
                emit('new_word', {
                    'word': display_word, 
                    'original_en': room['current_word']['en'],
                    'q_type': current_qt,
                    'options': room['current_word'].get('options', []),
                    'time': 15,
                    'current_q': room['current_question'],
                    'total_q': room['total_questions']
                }, room=room_code)
        else:
            emit('reconnect_success', {'room_code': room_code})

def next_word(room_code):
    if room_code not in rooms: return
    room = rooms[room_code]
    
    with room['lock']:
        # ---- LOG MISTAKES & SAVE HISTORY ----
        if room.get('current_word'):
            cw = room['current_word']
            room.setdefault('used_words_full', []).append(cw)
            en_key = cw['en'].replace('.', '')
            winner_sid = room.get('winner_sid')
            
            if users_collection is not None:
                for sid, p in room['players'].items():
                    if sid != winner_sid:
                        mistake_data = {
                            'en': cw['en'], 
                            'vi': cw['vi'], 
                            'level': 0, 
                            'next_review': time.time()
                        }
                        if 'sentence' in cw: mistake_data['sentence'] = cw['sentence']
                        if 'options' in cw: mistake_data['options'] = cw['options']
                        
                        users_collection.update_one(
                            {'_id': p['user_id']},
                            {'$set': {f'mistakes.{en_key}': mistake_data}},
                            upsert=True
                        )
                    else:
                        if room.get('vocab_type') == 'mistakes':
                            db_user = users_collection.find_one({'_id': p['user_id']})
                            if db_user and 'mistakes' in db_user and en_key in db_user['mistakes']:
                                old_level = db_user['mistakes'][en_key].get('level', 0)
                                new_level = old_level + 1
                                if new_level > 4:
                                    users_collection.update_one({'_id': p['user_id']}, {'$unset': {f'mistakes.{en_key}': ""}})
                                else:
                                    users_collection.update_one(
                                        {'_id': p['user_id']},
                                        {'$set': {
                                            f'mistakes.{en_key}.level': new_level,
                                            f'mistakes.{en_key}.next_review': get_srs_delay(new_level)
                                        }}
                                    )
                        
        # Reset winner_sid for next round
        room['winner_sid'] = None
        
        room['current_question'] += 1
        
        # Nếu đã chơi hết số câu thì kết thúc game
        if room['current_question'] > room['total_questions']:
            players_data = list(room['players'].values())
            players_data.sort(key=lambda x: x['score'], reverse=True)
            
            # Tính điểm Elo
            if len(players_data) > 1:
                max_score = players_data[0]['score']
                is_all_tie = len(set(p['score'] for p in players_data)) == 1
                for p in players_data:
                    if is_all_tie:
                        p['elo_change'] = 5 if max_score > 0 else 0
                    elif p['score'] == max_score:
                        p['elo_change'] = 15
                    else:
                        p['elo_change'] = -10
            else:
                players_data[0]['elo_change'] = 5 if players_data[0]['score'] > 0 else 0

            # Cập nhật Elo lên DB
            if users_collection is not None:
                for p in players_data:
                    new_elo = max(0, p.get('elo', 0) + p.get('elo_change', 0))
                    users_collection.update_one({'_id': p['user_id']}, {'$set': {'elo': new_elo}})

            socketio.emit('game_over', {'players': players_data, 'history': room.get('used_words_full', [])}, room=room_code)
            
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
        room['sync_answers'] = {} # Reset cho chế độ sync
        
        qt = room.get('q_type', 'en-vi')
        if qt == 'mixed':
            current_qt = random.choice(['en-vi', 'vi-en'])
        else:
            current_qt = qt
        room['current_q_type'] = current_qt
        
        room['round_id'] += 1 # Tăng ID vòng đấu để quản lý timer độc lập
        current_round = room['round_id']
        current_q = room['current_question']
        total_q = room['total_questions']
        
    display_word = word_obj['vi'] if current_qt == 'vi-en' else word_obj['en']
    if 'sentence' in word_obj:
        display_word = word_obj['sentence']
        
    # Emit từ cho cả 2 client
    socketio.emit('new_word', {
        'word': display_word, 
        'original_en': word_obj['en'],
        'q_type': current_qt,
        'options': word_obj.get('options', []),
        'time': 15,
        'current_q': current_q,
        'total_q': total_q
    }, room=room_code)
    
    # Bắt đầu luồng đếm ngược thời gian
    socketio.start_background_task(word_timer, room_code, current_round)

def evaluate_sync_round(room_code, room):
    qt = room.get('current_q_type', 'en-vi')
    correct_ans = room['current_word']['en'] if qt in ['vi-en', 'collocation'] else room['current_word']['vi']
    winners = []
    
    for sid, ans in room['sync_answers'].items():
        if check_answer(ans, correct_ans):
            room['players'][sid]['score'] += 10
            winners.append(room['players'][sid]['name'])
            
    players_data = list(room['players'].values())
    
    if winners:
        socketio.emit('sync_result', {
            'winners': winners,
            'players': players_data,
            'correct_answer': correct_ans
        }, room=room_code)
    else:
        socketio.emit('timeout', {'correct_answer': correct_ans}, room=room_code)
        
    socketio.start_background_task(delayed_next_word, room_code)

def word_timer(room_code, round_id):
    socketio.sleep(15) # Chờ 15s
    
    if room_code not in rooms: return
    room = rooms[room_code]
    
    with room['lock']:
        # Nếu đã qua 15s, vẫn ở round cũ và chưa ai trả lời đúng (hoặc chưa xong sync)
        if room['round_id'] == round_id and not room['answered']:
            room['answered'] = True # Khóa không cho nhận đáp án nữa
            
            if room.get('mode') in ['sync', 'sync3']:
                evaluate_sync_round(room_code, room)
            else:
                correct_answer = room['current_word']['en'] if room.get('current_q_type', 'en-vi') == 'vi-en' else room['current_word']['vi']
                socketio.emit('timeout', {'correct_answer': correct_answer}, room=room_code)
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
    session_id = data.get('session_id', request.sid)
    
    if room_code not in rooms: return
    room = rooms[room_code]
    
        # Sử dụng Block Lock để đảm bảo chỉ có 1 request được kiểm tra và cộng điểm tại 1 thời điểm
    with room['lock']:
        # Nếu đã trả lời xong hoặc không có từ hiện tại
        if room['answered'] or room['current_word'] is None:
            return 
            
        correct_en = room['current_word']['en'].strip().lower()
        correct_vi = room['current_word']['vi'].strip().lower()
        current_qt = room.get('current_q_type', 'en-vi')
        
        correct_answer = correct_en if current_qt in ['vi-en', 'collocation'] else correct_vi
        
        if room.get('mode') in ['sync', 'sync3']:
            room['sync_answers'][session_id] = answer
            emit('wait_for_other', {'message': 'Đang chờ đối thủ...'})
            
            if len(room['sync_answers']) == len(room['players']):
                room['answered'] = True
                evaluate_sync_round(room_code, room)
        else:
            if check_answer(answer, correct_answer):
                room['answered'] = True
                room['winner_sid'] = session_id # Đánh dấu người chiến thắng
            
                # Xóa hoặc giảm án tích nếu trả lời đúng
                if users_collection is not None:
                    user_db = users_collection.find_one({'_id': session_id})
                    if user_db and 'mistakes' in user_db:
                        en_key = correct_en.replace('.', '')
                        if en_key in user_db['mistakes']:
                            current_errors = user_db['mistakes'][en_key].get('errors', 2)
                            if current_errors <= 1:
                                users_collection.update_one({'_id': session_id}, {'$unset': {f'mistakes.{en_key}': ""}})
                            else:
                                users_collection.update_one({'_id': session_id}, {'$inc': {f'mistakes.{en_key}.errors': -1}})
            
                # Tăng điểm
                room['players'][session_id]['score'] += 10
                
                players_data = list(room['players'].values())
                winner_name = room['players'][session_id]['name']
                
                socketio.emit('correct_answer', {
                    'winner': winner_name,
                    'players': players_data,
                    'correct_answer': correct_answer
                }, room=room_code)
                
                socketio.start_background_task(delayed_next_word, room_code)
            else:
                emit('wrong_answer', {'message': 'Sai rồi'})

@socketio.on('disconnect')
def on_disconnect():
    for room_code, room in list(rooms.items()):
        disconnected_session = None
        for sess_id, p in list(room['players'].items()):
            if p.get('sid') == request.sid:
                disconnected_session = sess_id
                p['connected'] = False
                break
                
        if disconnected_session:
            # Gửi sự kiện mất kết nối
            socketio.emit('player_disconnected', {'message': 'Một người chơi bị mất kết nối!'}, room=room_code)
            
            # Xóa phòng sau 3 phút nếu không có ai quay lại
            def cleanup_room(code):
                socketio.sleep(180)
                if code in rooms:
                    active = [p for p in rooms[code]['players'].values() if p.get('connected', True)]
                    if len(active) == 0:
                        del rooms[code]
                        
            socketio.start_background_task(cleanup_room, room_code)
            break

@socketio.on('save_vocab_set')
def on_save_vocab_set(data):
    pairs = data.get('pairs', [])
    source = data.get('source', 'manual')
    if len(pairs) < 3:
        emit('vocab_save_error', {'message': 'Cần ít nhất 3 cặp từ!'})
        return
        
    set_id = data.get('set_id')
    if not set_id:
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
    
    emit('vocab_saved', {'set_id': set_id, 'source': source})

@socketio.on('send_emoji')
def on_send_emoji(data):
    room_code = data.get('room_code')
    emoji = data.get('emoji')
    if room_code in rooms:
        socketio.emit('receive_emoji', {'emoji': emoji}, room=room_code)

@socketio.on('request_leaderboard')
def handle_leaderboard():
    if users_collection is not None:
        top_users = list(users_collection.find({'banned': {'$ne': True}}).sort('elo', -1).limit(10))
        data = [{'name': u.get('name', 'Guest'), 'elo': u.get('elo', 0)} for u in top_users]
        emit('leaderboard_data', data)

@socketio.on('request_user_stats')
def handle_user_stats(data):
    session_id = data.get('session_id')
    if users_collection is not None:
        user = users_collection.find_one({'_id': session_id})
        if user:
            mistakes = user.get('mistakes', {})
            now = time.time()
            due_count = sum(1 for w in mistakes.values() if w.get('next_review', 0) <= now)
            emit('user_stats', {'mistakes_count': due_count, 'total_mistakes': len(mistakes)})

@socketio.on('request_flashcards')
def handle_request_flashcards(data):
    session_id = data.get('session_id')
    if users_collection is None:
        emit('flashcards_data', [])
        return
        
    user = users_collection.find_one({'_id': session_id})
    cards = []
    if user and 'mistakes' in user:
        now = time.time()
        for k, w in user['mistakes'].items():
            if w.get('next_review', 0) <= now:
                cards.append(w)
    # Shuffle for randomness
    random.shuffle(cards)
    emit('flashcards_data', cards)

@socketio.on('request_custom_flashcards')
def handle_request_custom_flashcards(data):
    set_id = data.get('set_id', '').upper()
    vocabs = load_custom_vocabs()
    
    if set_id in vocabs:
        cards = vocabs[set_id]
        # Xáo trộn thẻ
        random.shuffle(cards)
        emit('flashcards_data', cards)
    else:
        emit('flashcards_data', [])

@socketio.on('flashcard_result')
def handle_flashcard_result(data):
    session_id = data.get('session_id')
    en_word = data.get('en', '')
    status = data.get('status') # 'remembered' or 'forgot'
    
    if users_collection is None or not en_word: return
    
    user = users_collection.find_one({'_id': session_id})
    if user and 'mistakes' in user:
        en_key = en_word.replace('.', '')
        if en_key in user['mistakes']:
            old_level = user['mistakes'][en_key].get('level', 0)
            
            if status == 'remembered':
                new_level = old_level + 1
                if new_level > 4:
                    # Đã thuộc hẳn -> Xóa khỏi sổ tay
                    users_collection.update_one({'_id': session_id}, {'$unset': {f'mistakes.{en_key}': ""}})
                else:
                    users_collection.update_one(
                        {'_id': session_id},
                        {'$set': {
                            f'mistakes.{en_key}.level': new_level,
                            f'mistakes.{en_key}.next_review': get_srs_delay(new_level)
                        }}
                    )
            elif status == 'forgot':
                # Quên -> Giảm level về 0 hoặc 1 để học lại sớm hơn
                new_level = max(0, old_level - 1)
                users_collection.update_one(
                    {'_id': session_id},
                    {'$set': {
                        f'mistakes.{en_key}.level': new_level,
                        f'mistakes.{en_key}.next_review': get_srs_delay(new_level) # Ôn lại sớm
                    }}
                )

@socketio.on('check_speaking')
def handle_check_speaking(data):
    import re
    import difflib
    
    expected = data.get('expected', '')
    actual = data.get('actual', '')
    
    # Làm sạch văn bản: Bỏ dấu câu, chuyển chữ thường
    exp_clean = re.sub(r'[^\w\s]', '', expected).lower().split()
    act_clean = re.sub(r'[^\w\s]', '', actual).lower().split()
    
    matcher = difflib.SequenceMatcher(None, exp_clean, act_clean)
    score = int(matcher.ratio() * 100)
    
    feedback = []
    for tag, i1, i2, j1, j2 in matcher.get_opcodes():
        if tag == 'equal':
            for word in exp_clean[i1:i2]:
                feedback.append({'word': word, 'status': 'correct'})
        elif tag in ('replace', 'delete'):
            for word in exp_clean[i1:i2]:
                feedback.append({'word': word, 'status': 'wrong'})
        # Bỏ qua 'insert' vì đó là từ thừa người dùng đọc, không map với văn bản gốc
    
    emit('speaking_result', {'score': score, 'feedback': feedback})

@socketio.on('admin_skill')
def handle_admin_skill(data):
    room_code = data.get('room_code', '').upper()
    skill = data.get('skill')
    session_id = data.get('session_id')
    
    if room_code not in rooms: return
    if users_collection is None: return
    
    user = users_collection.find_one({'_id': session_id})
    if user and user.get('is_admin'):
        room = rooms[room_code]
        if skill == 'freeze':
            socketio.emit('skill_freeze', {'sender_id': session_id}, room=room_code)
        elif skill == 'auto_correct':
            with room['lock']:
                if room.get('answered', False): return
                word_obj = room.get('current_word')
                if not word_obj: return
                current_qt = room.get('current_q_type', 'en-vi')
                answer = word_obj['vi'] if current_qt == 'en-vi' else word_obj['en']
            emit('skill_auto_correct', {'answer': answer}, to=request.sid)
        elif skill == 'reset_timer':
            socketio.emit('skill_reset_timer', {}, room=room_code)

if __name__ == '__main__':
    # Sẵn sàng triển khai Render: Lấy cổng động từ biến môi trường
    port = int(os.environ.get('PORT', 5000))
    socketio.run(app, host='0.0.0.0', port=port, allow_unsafe_werkzeug=True)
