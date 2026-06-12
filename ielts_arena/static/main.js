const socket = io();

// Các giao diện màn hình
const lobbyScreen = document.getElementById('lobby-screen');
const waitingScreen = document.getElementById('waiting-screen');
const arenaScreen = document.getElementById('arena-screen');
const createVocabScreen = document.getElementById('create-vocab-screen');
const summaryScreen = document.getElementById('summary-screen');
const reviewScreen = document.getElementById('review-screen');
const speakingScreen = document.getElementById('speaking-screen');

// Các phần tử DOM
const playerNameInput = document.getElementById('player-name');
const roomCodeInput = document.getElementById('room-code-input');
const btnCreate = document.getElementById('btn-create');
const btnJoin = document.getElementById('btn-join');
const lobbyMessage = document.getElementById('lobby-message');
const displayRoomCode = document.getElementById('display-room-code');

const btnShowCreateVocab = document.getElementById('btn-show-create-vocab');
const btnBackLobby = document.getElementById('btn-back-lobby');
const btnAddPair = document.getElementById('btn-add-pair');
const btnSaveVocab = document.getElementById('btn-save-vocab');
const vocabPairsContainer = document.getElementById('vocab-pairs-container');
const vocabMessage = document.getElementById('create-vocab-message');
const vocabTypeSelect = document.getElementById('vocab-type');
const customVocabIdInput = document.getElementById('custom-vocab-id');
const playModeSelect = document.getElementById('play-mode');
const randomQuestionCountInput = document.getElementById('random-question-count');
const vocabTopicSelect = document.getElementById('vocab-topic');
const defaultOptionsContainer = document.getElementById('default-options-container');

const player1Name = document.querySelector('#player1-score .name');
const player1Score = document.querySelector('#player1-score .score');
const player2Name = document.querySelector('#player2-score .name');
const player2Score = document.querySelector('#player2-score .score');
const player3Name = document.querySelector('#player3-score .name');
const player3Score = document.querySelector('#player3-score .score');
const countdownEl = document.getElementById('countdown');
const englishWordEl = document.getElementById('english-word');
const btnSpeak = document.getElementById('btn-speak');
const answerInput = document.getElementById('answer-input');
const btnSubmit = document.getElementById('btn-submit');
const resultMessage = document.getElementById('result-message');

let currentRoomCode = '';
let myName = '';
let timerInterval;
let isAdmin = false;

// Khởi tạo 1 session ID cố định cho người dùng này (để reconnect khi load lại tab)
let mySessionId = localStorage.getItem('ielts_arena_session_id');
if (!mySessionId) {
    mySessionId = Math.random().toString(36).substring(2, 15);
    localStorage.setItem('ielts_arena_session_id', mySessionId);
}

// Hàm lấy thông tin Rank dựa trên Elo
function getRankInfo(elo) {
    if (elo < 200) return { name: 'Trứng Nước 🌱', badge: '🌱' };
    if (elo < 500) return { name: 'Tân Binh 🥉', badge: '🥉' };
    if (elo < 1000) return { name: 'Trung Cấp 🥈', badge: '🥈' };
    if (elo < 1500) return { name: 'Cao Thủ 🥇', badge: '🥇' };
    return { name: 'IELTS Master 💎', badge: '💎' };
}

// Khởi tạo Elo
let myElo = parseInt(localStorage.getItem('ielts_arena_elo')) || 0;
const lobbyRankDisplay = document.getElementById('lobby-rank-display');
if (lobbyRankDisplay) {
    const rank = getRankInfo(myElo);
    lobbyRankDisplay.textContent = `${rank.name} (${myElo} Elo)`;
}

// Hàm phát âm từ vựng
function playAudio(word) {
    if ('speechSynthesis' in window) {
        // Hủy các giọng đọc cũ đang dở (nếu có)
        window.speechSynthesis.cancel();
        
        const utterance = new SpeechSynthesisUtterance(word);
        utterance.lang = 'en-US'; 
        utterance.rate = 0.9; // Đọc chậm một chút
        window.speechSynthesis.speak(utterance);
    }
}

// Lắng nghe sự kiện click nút loa
if (btnSpeak) {
    btnSpeak.addEventListener('click', () => {
        const wordToSpeak = englishWordEl.dataset.originalEn || englishWordEl.textContent;
        if (wordToSpeak && wordToSpeak !== 'Loading...') {
            playAudio(wordToSpeak);
            
            // Tạo hiệu ứng click
            btnSpeak.style.transform = 'scale(0.9)';
            setTimeout(() => btnSpeak.style.transform = 'scale(1)', 150);
        }
    });
}

// Lắng nghe phím tắt Tab để phát âm
document.addEventListener('keydown', (e) => {
    if (e.key === 'Tab' && arenaScreen.classList.contains('active')) {
        e.preventDefault(); // Ngăn Tab nhảy sang ô khác
        if (btnSpeak) btnSpeak.click();
    }
});

function showScreen(screen) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    screen.classList.add('active');
    
    // Ẩn/hiện nút "Tạo bộ từ vựng" chỉ ở màn hình sảnh
    const btnCreateVocab = document.getElementById('btn-show-create-vocab');
    if (btnCreateVocab) {
        if (screen.id === 'lobby-screen') {
            btnCreateVocab.style.display = 'block';
        } else {
            btnCreateVocab.style.display = 'none';
        }
    }
}

// Khôi phục tên người chơi
let savedName = localStorage.getItem('ielts_arena_name');
if (savedName && playerNameInput) {
    playerNameInput.value = savedName;
}

function getPlayerName() {
    const name = playerNameInput.value.trim() || 'Guest_' + Math.floor(Math.random() * 1000);
    localStorage.setItem('ielts_arena_name', name);
    return name;
}

// Xử lý ẩn/hiện ô nhập Mã bộ từ vựng & số lượng câu
if (vocabTypeSelect) {
    vocabTypeSelect.addEventListener('change', () => {
        if (vocabTypeSelect.value === 'custom') {
            customVocabIdInput.style.display = 'block';
            randomQuestionCountInput.style.display = 'none';
            if (defaultOptionsContainer) defaultOptionsContainer.style.display = 'none';
            customVocabIdInput.focus();
        } else {
            customVocabIdInput.style.display = 'none';
            randomQuestionCountInput.style.display = 'block';
            if (defaultOptionsContainer) defaultOptionsContainer.style.display = 'flex';
        }
    });
}

// Chuyển sang màn hình tạo bộ từ vựng
btnShowCreateVocab.addEventListener('click', () => {
    showScreen(createVocabScreen);
    btnShowCreateVocab.style.display = 'none';
});

// Quay lại sảnh
btnBackLobby.addEventListener('click', () => {
    showScreen(lobbyScreen);
    btnShowCreateVocab.style.display = 'block';
});

// Thêm ô nhập từ vựng mới
btnAddPair.addEventListener('click', () => {
    const pairDiv = document.createElement('div');
    pairDiv.className = 'vocab-pair input-area';
    pairDiv.style.marginBottom = '10px';
    pairDiv.innerHTML = `
        <input type="text" class="vocab-en" placeholder="Tiếng Anh" required>
        <input type="text" class="vocab-vi" placeholder="Tiếng Việt" required>
    `;
    vocabPairsContainer.appendChild(pairDiv);
    // Focus vào input vừa tạo
    pairDiv.querySelector('.vocab-en').focus();
});

// Xử lý trích xuất hàng loạt
const bulkVocabInput = document.getElementById('bulk-vocab-input');
const btnParseBulk = document.getElementById('btn-parse-bulk');

if (btnParseBulk && bulkVocabInput) {
    btnParseBulk.addEventListener('click', () => {
        const text = bulkVocabInput.value.trim();
        if (!text) {
            vocabMessage.textContent = 'Vui lòng dán danh sách từ vào ô trên!';
            vocabMessage.style.color = 'var(--error)';
            return;
        }

        const lines = text.split('\n');
        let addedCount = 0;

        lines.forEach(line => {
            // Hỗ trợ phân cách bằng dấu '|', '-', hoặc ':'
            const parts = line.split(/\||-|:/);
            if (parts.length >= 2) {
                const en = parts[0].trim();
                const vi = parts.slice(1).join(' ').trim(); // Đề phòng có nhiều dấu phân cách ở phần nghĩa
                
                if (en && vi) {
                    const pairDiv = document.createElement('div');
                    pairDiv.className = 'vocab-pair input-area';
                    pairDiv.style.marginBottom = '10px';
                    pairDiv.innerHTML = `
                        <input type="text" class="vocab-en" placeholder="Tiếng Anh" value="${en}" required>
                        <input type="text" class="vocab-vi" placeholder="Tiếng Việt" value="${vi}" required>
                    `;
                    vocabPairsContainer.appendChild(pairDiv);
                    addedCount++;
                }
            }
        });

        if (addedCount > 0) {
            bulkVocabInput.value = ''; // clear input
            vocabMessage.textContent = `Thành công! Đã trích xuất ${addedCount} từ vựng.`;
            vocabMessage.style.color = 'var(--success)';
            
            // Xóa các ô trống ban đầu nếu chúng đang trống
            document.querySelectorAll('.vocab-pair').forEach(pair => {
                const enVal = pair.querySelector('.vocab-en').value;
                const viVal = pair.querySelector('.vocab-vi').value;
                if (!enVal && !viVal) {
                    pair.remove();
                }
            });
        } else {
            vocabMessage.textContent = 'Không tìm thấy từ hợp lệ. Vui lòng kiểm tra định dạng (Từ | Nghĩa)';
            vocabMessage.style.color = 'var(--error)';
        }
    });
}

// Lưu bộ từ vựng vào LocalStorage của trình duyệt
btnSaveVocab.addEventListener('click', () => {
    const pairs = [];
    document.querySelectorAll('.vocab-pair').forEach(pair => {
        const en = pair.querySelector('.vocab-en').value;
        const vi = pair.querySelector('.vocab-vi').value;
        if (en && vi) pairs.push({en, vi});
    });
    
    if (pairs.length < 3) {
        vocabMessage.textContent = 'Vui lòng điền đầy đủ tiếng Anh và Việt (ít nhất 3 từ)!';
        vocabMessage.style.color = 'var(--error)';
        return;
    }
    
    // Tạo ID ngẫu nhiên
    const setId = Math.random().toString(36).substring(2, 7).toUpperCase();
    
    // Lưu vào LocalStorage
    let savedVocabs = JSON.parse(localStorage.getItem('my_custom_vocabs') || '{}');
    savedVocabs[setId] = pairs;
    localStorage.setItem('my_custom_vocabs', JSON.stringify(savedVocabs));
    
    vocabMessage.textContent = `Thành công! Mã bộ từ vựng: ${setId}`;
    vocabMessage.style.color = 'var(--success)';
    
    // Tự động copy và chuyển về sảnh
    if (navigator && navigator.clipboard) {
        navigator.clipboard.writeText(setId).catch(() => {});
    }
    
    setTimeout(() => {
        showScreen(lobbyScreen);
        if (btnShowCreateVocab) btnShowCreateVocab.style.display = 'block';
        vocabMessage.textContent = '';
        
        // Tự điền vào form tạo phòng
        if (vocabTypeSelect) vocabTypeSelect.value = 'custom';
        if (customVocabIdInput) {
            customVocabIdInput.style.display = 'block';
            customVocabIdInput.value = setId;
        }
    }, 2500);
});

// Bắt sự kiện tạo phòng
btnCreate.addEventListener('click', () => {
    myName = getPlayerName();
    const vocabType = vocabTypeSelect.value;
    const customSetId = customVocabIdInput.value.trim().toUpperCase();
    const playMode = playModeSelect ? playModeSelect.value : 'multi';
    const qType = document.getElementById('question-type') ? document.getElementById('question-type').value : 'en-vi';
    const qCount = parseInt(randomQuestionCountInput.value) || 10;
    const vTopic = vocabTopicSelect ? vocabTopicSelect.value : 'all';
    
    let customVocabData = [];
    
    if (vocabType === 'custom') {
        if (!customSetId) {
            lobbyMessage.textContent = 'Vui lòng nhập Mã bộ từ vựng!';
            return;
        }
        let savedVocabs = JSON.parse(localStorage.getItem('my_custom_vocabs') || '{}');
        if (savedVocabs[customSetId]) {
            customVocabData = savedVocabs[customSetId];
        } else {
            lobbyMessage.textContent = 'Mã bộ từ vựng không tồn tại trên thiết bị này!';
            return;
        }
    }
    
    socket.emit('create_room', { 
        name: myName,
        vocab_type: vocabType,
        custom_set_id: customSetId,
        custom_vocab_data: customVocabData,
        play_mode: playMode,
        q_type: qType,
        question_count: qCount,
        vocab_topic: vTopic,
        session_id: mySessionId,
        elo: myElo
    });
});

// Bắt sự kiện tham gia
btnJoin.addEventListener('click', () => {
    const code = roomCodeInput.value.trim();
    if (!code) return lobbyMessage.textContent = 'Vui lòng nhập mã phòng!';
    myName = getPlayerName();
    socket.emit('join_room', { name: myName, room_code: code, session_id: mySessionId, elo: myElo });
});

// Gửi đáp án (Hỗ trợ nút Submit và phím Enter)
function submitAnswer() {
    const answer = answerInput.value;
    if (!answer) return;
    socket.emit('submit_answer', { room_code: currentRoomCode, answer: answer, session_id: mySessionId });
    answerInput.value = '';
}
btnSubmit.addEventListener('click', submitAnswer);
answerInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') submitAnswer(); });

// Nhận diện giọng nói (Speech-to-Text)
const btnMic = document.getElementById('btn-mic');
let recognition = null;
if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    recognition = new SpeechRecognition();
    recognition.lang = 'en-US'; // Nhận diện tiếng Anh
    recognition.continuous = false;
    recognition.interimResults = false;
    
    recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        answerInput.value = transcript;
        submitAnswer(); // Tự động gửi bài luôn
        if (btnMic) btnMic.classList.remove('mic-active');
    };
    
    recognition.onerror = () => { if (btnMic) btnMic.classList.remove('mic-active'); };
    recognition.onend = () => { if (btnMic) btnMic.classList.remove('mic-active'); };
}

if (btnMic) {
    btnMic.addEventListener('click', () => {
        if (recognition) {
            btnMic.classList.add('mic-active');
            recognition.start();
        } else {
            alert('Trình duyệt của bạn không hỗ trợ nhận diện giọng nói. Vui lòng dùng Chrome!');
        }
    });
}


// --- LẮNG NGHE SỰ KIỆN TỪ SERVER ---

socket.on('sync_data', (data) => {
    myElo = data.elo;
    isAdmin = data.is_admin || false;
    localStorage.setItem('ielts_arena_elo', myElo);
    if (lobbyRankDisplay) {
        const rank = getRankInfo(myElo);
        lobbyRankDisplay.innerHTML = `${rank.name} (${myElo} Elo) ${isAdmin ? '<span style="color:#f472b6; font-size: 0.8rem;">[ADMIN]</span>' : ''}`;
    }
});

socket.on('connect', () => {
    // Xin thông tin user (để lấy danh sách từ sai)
    socket.emit('request_user_stats', { session_id: mySessionId });
    
    // Nếu mất kết nối và có lại, tự động báo cho server khôi phục session
    if (currentRoomCode) {
        socket.emit('reconnect_session', { room_code: currentRoomCode, session_id: mySessionId });
    }
});

socket.on('reconnect_success', (data) => {
    console.log('Khôi phục kết nối thành công với phòng:', data.room_code);
});

socket.on('room_created', (data) => {
    currentRoomCode = data.room_code;
    displayRoomCode.textContent = currentRoomCode;
    showScreen(waitingScreen);
    if(btnShowCreateVocab) btnShowCreateVocab.style.display = 'none';
});

socket.on('room_joined', (data) => { 
    currentRoomCode = data.room_code; 
    displayRoomCode.textContent = currentRoomCode;
    showScreen(waitingScreen);
    if(btnShowCreateVocab) btnShowCreateVocab.style.display = 'none';
});

socket.on('waiting_update', (data) => {
    const waitingMessage = document.getElementById('waiting-message');
    if (waitingMessage) {
        waitingMessage.innerHTML = `Đang chờ người chơi khác tham gia... <br><br> <span style="font-size: 1.2rem; color: var(--primary); font-weight: bold;">(${data.current}/${data.max} người)</span>`;
    }
});

socket.on('user_stats', (data) => {
    const btnRevenge = document.getElementById('btn-revenge');
    const btnFlashcards = document.getElementById('btn-flashcards');
    const btnFlashcardsCustom = document.getElementById('btn-flashcards-custom');
    const flashcardCustomId = document.getElementById('flashcard-custom-id');
    const mistakeCount = document.getElementById('mistake-count');
    
    if (btnRevenge && mistakeCount) {
        if (data.mistakes_count > 0) {
            btnRevenge.style.display = 'block';
            btnRevenge.style.opacity = '1';
            if (btnFlashcards) btnFlashcards.style.display = 'block';
            mistakeCount.textContent = data.mistakes_count;
            btnRevenge.innerHTML = `📓 Ôn tập Từ Hay Sai (<span id="mistake-count" style="color: #fbbf24;">${data.mistakes_count}</span> từ đến hạn)`;
        } else if (data.total_mistakes > 0) {
            btnRevenge.style.display = 'block';
            btnRevenge.style.opacity = '0.6';
            if (btnFlashcards) btnFlashcards.style.display = 'block';
            btnRevenge.innerHTML = `📓 Đã ôn hết (Tổng: ${data.total_mistakes} từ)`;
        } else {
            btnRevenge.style.display = 'none';
            if (btnFlashcards) btnFlashcards.style.display = 'none';
        }
    }
});

const btnRevenge = document.getElementById('btn-revenge');
if (btnRevenge) {
    btnRevenge.addEventListener('click', () => {
        myName = getPlayerName();
        socket.emit('create_room', { 
            name: myName,
            vocab_type: 'mistakes',
            play_mode: 'single', // Chơi 1 mình ôn bài
            q_count: 10,
            session_id: mySessionId,
            elo: myElo
        });
    });
}

socket.on('error', (data) => { lobbyMessage.textContent = data.message; });

// Kết quả lưu bộ từ vựng
socket.on('vocab_save_error', (data) => {
    vocabMessage.textContent = data.message;
    vocabMessage.style.color = 'var(--error)';
});

socket.on('vocab_saved', (data) => {
    vocabMessage.textContent = `Thành công! Mã của bạn là: ${data.set_id} (Đã copy)`;
    vocabMessage.style.color = 'var(--success)';
    
    // Tự động điền cho người dùng
    vocabTypeSelect.value = 'custom';
    customVocabIdInput.style.display = 'block';
    customVocabIdInput.value = data.set_id;
    
    // Copy mã vào clipboard
    navigator.clipboard.writeText(data.set_id).catch(() => {});
    
    // Về sảnh chờ sau 2s
    setTimeout(() => {
        showScreen(lobbyScreen);
        btnShowCreateVocab.style.display = 'block';
        vocabMessage.textContent = '';
    }, 2500);
});

// Trận đấu bắt đầu
socket.on('game_start', (data) => {
    showScreen(arenaScreen);
    if(btnShowCreateVocab) btnShowCreateVocab.style.display = 'none';
    
    // Show Admin Panel if applicable
    const adminPanel = document.getElementById('admin-skills-panel');
    if (adminPanel) {
        adminPanel.style.display = isAdmin ? 'block' : 'none';
    }
    
    const players = data.players;
    player1Name.innerHTML = `${players[0].name} <span class="rank-badge">${getRankInfo(players[0].elo).badge}</span>`;
    player1Score.textContent = players[0].score;
    
    if (players[1]) {
        document.getElementById('player2-score').style.display = 'flex';
        player2Name.innerHTML = `${players[1].name} <span class="rank-badge">${getRankInfo(players[1].elo).badge}</span>`;
        player2Score.textContent = players[1].score;
    } else {
        document.getElementById('player2-score').style.display = 'none';
    }

    if (players[2]) {
        document.getElementById('player3-score').style.display = 'flex';
        player3Name.innerHTML = `${players[2].name} <span class="rank-badge">${getRankInfo(players[2].elo).badge}</span>`;
        player3Score.textContent = players[2].score;
    } else {
        document.getElementById('player3-score').style.display = 'none';
    }
});

const currentQDisplay = document.getElementById('current-q-display');
const totalQDisplay = document.getElementById('total-q-display');

// Bắt đầu vòng mới: hiển thị từ mới và reset UI
socket.on('new_word', (data) => {
    englishWordEl.dataset.originalEn = data.original_en;
    englishWordEl.dataset.qType = data.q_type;
    
    if (data.q_type === 'collocation') {
        englishWordEl.style.fontSize = '1.3rem';
        englishWordEl.style.lineHeight = '1.6';
        englishWordEl.style.fontWeight = 'normal';
        englishWordEl.innerHTML = data.word.replace('_____', '<span style="border-bottom: 2px dashed #fbbf24; width: 60px; display: inline-block; margin: 0 5px;"></span>');
        
        document.getElementById('input-container').style.display = 'none';
        const optionsContainer = document.getElementById('options-container');
        optionsContainer.style.display = 'grid';
        optionsContainer.innerHTML = '';
        
        // Trộn ngẫu nhiên 4 đáp án
        const shuffled = [...data.options].sort(() => Math.random() - 0.5);
        shuffled.forEach(opt => {
            const btn = document.createElement('button');
            btn.className = 'btn';
            btn.style.background = '#334155';
            btn.style.padding = '15px';
            btn.style.fontSize = '1.1rem';
            btn.textContent = opt;
            btn.onclick = () => {
                socket.emit('submit_answer', { room_code: currentRoomCode, answer: opt, session_id: mySessionId });
                // Đổi màu đỏ để báo hiệu đã bấm thử (nếu đúng thì server sẽ đè màu xanh lên)
                btn.disabled = true;
                btn.style.background = '#ef4444';
            };
            optionsContainer.appendChild(btn);
        });
    } else {
        englishWordEl.style.fontSize = '';
        englishWordEl.style.lineHeight = '';
        englishWordEl.style.fontWeight = '';
        englishWordEl.textContent = data.word;
        
        document.getElementById('input-container').style.display = 'flex';
        document.getElementById('options-container').style.display = 'none';
        if (data.q_type === 'vi-en') {
            answerInput.placeholder = 'Nhập từ tiếng Anh (VD: hello)';
            if (btnSpeak) btnSpeak.style.display = 'none'; // Không hiển thị lúc đang hỏi
            if (btnMic) btnMic.style.display = 'block'; // Hiện nút Mic
        } else {
            answerInput.placeholder = 'Nhập nghĩa tiếng Việt (VD: xin chào)';
            if (btnSpeak) btnSpeak.style.display = 'flex';
            if (btnMic) btnMic.style.display = 'none'; // Ẩn nút Mic
            playAudio(data.original_en);
        }
        answerInput.disabled = false;
        btnSubmit.disabled = false;
        answerInput.value = ''; // Xóa chữ gõ dở từ vòng trước
        answerInput.focus();
    }

    if (currentQDisplay && totalQDisplay) {
        currentQDisplay.textContent = data.current_q;
        totalQDisplay.textContent = data.total_q;
    }
    resultMessage.textContent = '';
    resultMessage.className = 'result-message';
    
    // Khởi động đồng hồ đếm ngược Frontend
    let timeLeft = data.time;
    countdownEl.textContent = timeLeft;
    
    clearInterval(timerInterval);
    timerInterval = setInterval(() => {
        timeLeft--;
        countdownEl.textContent = timeLeft;
        if (timeLeft <= 0) {
            clearInterval(timerInterval);
            answerInput.disabled = true;
            btnSubmit.disabled = true;
            document.querySelectorAll('#options-container button').forEach(b => { b.disabled = true; b.style.opacity = '0.5'; });
        }
    }, 1000);
});

// Xử lý khi có người trả lời đúng
socket.on('correct_answer', (data) => {
    clearInterval(timerInterval);
    answerInput.disabled = true;
    btnSubmit.disabled = true;
    document.querySelectorAll('#options-container button').forEach(b => { 
        b.disabled = true; 
        if (b.textContent === data.correct_answer) {
            b.style.background = '#10b981';
            b.style.opacity = '1';
        } else {
            b.style.opacity = '0.5'; 
        }
    });
    
    resultMessage.textContent = `🎯 ${data.winner} +10đ! Đáp án: ${data.correct_answer}`;
    resultMessage.className = 'result-message success';
    
    // Cập nhật điểm ngay lập tức
    const players = data.players;
    player1Score.textContent = players[0].score;
    if (players[1]) player2Score.textContent = players[1].score;
    if (players[2]) player3Score.textContent = players[2].score;
    
    if (englishWordEl.dataset.qType === 'vi-en') {
        playAudio(englishWordEl.dataset.originalEn);
        if (btnSpeak) btnSpeak.style.display = 'flex';
    }
});

// Xử lý chế độ sync
socket.on('wait_for_other', (data) => {
    answerInput.disabled = true;
    btnSubmit.disabled = true;
    document.querySelectorAll('#options-container button').forEach(b => { b.disabled = true; b.style.opacity = '0.5'; });
    resultMessage.textContent = `⏳ ${data.message}`;
    resultMessage.className = 'result-message';
    resultMessage.style.color = '#eab308'; // Màu vàng warning
});

socket.on('sync_result', (data) => {
    clearInterval(timerInterval);
    answerInput.disabled = true;
    btnSubmit.disabled = true;
    document.querySelectorAll('#options-container button').forEach(b => { 
        b.disabled = true; 
        if (b.textContent === data.correct_answer) {
            b.style.background = '#10b981';
            b.style.opacity = '1';
        } else {
            b.style.opacity = '0.5'; 
        }
    });
    
    resultMessage.textContent = `🎯 ${data.winners.join(' và ')} đúng! Đáp án: ${data.correct_answer}`;
    resultMessage.className = 'result-message success';
    
    const players = data.players;
    player1Score.textContent = players[0].score;
    if (players[1]) player2Score.textContent = players[1].score;
    if (players[2]) player3Score.textContent = players[2].score;
    
    if (englishWordEl.dataset.qType === 'vi-en') {
        playAudio(englishWordEl.dataset.originalEn);
        if (btnSpeak) btnSpeak.style.display = 'flex';
    }
});

// Hết giờ
socket.on('timeout', (data) => {
    clearInterval(timerInterval);
    answerInput.disabled = true;
    btnSubmit.disabled = true;
    document.querySelectorAll('#options-container button').forEach(b => { 
        b.disabled = true; 
        if (b.textContent === data.correct_answer) {
            b.style.background = '#10b981';
            b.style.opacity = '1';
        } else {
            b.style.opacity = '0.5'; 
        }
    });
    resultMessage.textContent = `⏰ Hết giờ! Đáp án: ${data.correct_answer}`;
    resultMessage.className = 'result-message error';
    
    if (englishWordEl.dataset.qType === 'vi-en') {
        playAudio(englishWordEl.dataset.originalEn);
        if (btnSpeak) btnSpeak.style.display = 'flex';
    }
});

// Nhập sai
socket.on('wrong_answer', () => {
    answerInput.classList.add('error-shake');
    setTimeout(() => answerInput.classList.remove('error-shake'), 400);
});

// Đối thủ thoát
socket.on('player_disconnected', () => {
    alert('Đối thủ đã rời phòng!');
    window.location.reload();
});

// Kết thúc game
const winnerNameEl = document.getElementById('winner-name');
const finalScoresEl = document.getElementById('final-scores');
const btnPlayAgain = document.getElementById('btn-play-again');

socket.on('game_over', (data) => {
    clearInterval(timerInterval);
    showScreen(summaryScreen);
    
    const players = data.players;
    if (players.length === 1) {
        winnerNameEl.textContent = 'Hoàn thành!';
        finalScoresEl.innerHTML = `Bạn đạt được: <span style="color: var(--primary); font-weight: bold;">${players[0].score}</span> điểm`;
    } else {
        const maxScore = Math.max(...players.map(p => p.score));
        const winners = players.filter(p => p.score === maxScore);
        
        if (winners.length === players.length && maxScore > 0) {
            winnerNameEl.textContent = 'Hòa Nhau! 🤝';
        } else if (winners.length === players.length && maxScore === 0) {
            winnerNameEl.textContent = 'Hòa Nhau! 🤝';
        } else {
            winnerNameEl.textContent = `${winners.map(w => w.name).join(' & ')} Thắng! 🎉`;
        }
        
        let scoresHtml = '';
        players.forEach(p => {
            const changeStr = p.elo_change >= 0 ? `+${p.elo_change}` : p.elo_change;
            scoresHtml += `${p.name}: ${p.score} điểm <span style="font-size: 0.9rem; color: #fbbf24;">(Elo: ${changeStr})</span><br>`;
            
            // Nếu là mình thì lưu Elo vào máy
            if (p.name === myName) {
                myElo += p.elo_change;
                if (myElo < 0) myElo = 0;
                localStorage.setItem('ielts_arena_elo', myElo);
                // Cập nhật lại ở sảnh
                if (lobbyRankDisplay) {
                    const rank = getRankInfo(myElo);
                    lobbyRankDisplay.textContent = `${rank.name} (${myElo} Elo)`;
                }
            }
        });
        finalScoresEl.innerHTML = scoresHtml;
    }
    
    // --- BÁO CÁO TỪ VỰNG ---
    const reviewList = document.getElementById('review-list');
    if (reviewList && data.history) {
        reviewList.innerHTML = '';
        data.history.forEach((w, index) => {
            const li = document.createElement('li');
            li.style.background = '#0f172a';
            li.style.padding = '12px 15px';
            li.style.borderRadius = '8px';
            li.style.marginBottom = '10px';
            li.style.borderLeft = '4px solid #f472b6';
            
            const dictId = 'dict-' + Math.random().toString(36).substr(2, 9);
            const safeEn = w.en.replace(new RegExp("'", 'g'), "\\'");
            
            li.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <div>
                        <strong style="color: #fbbf24; font-size: 1.1rem;">${index + 1}. ${w.en}</strong> 
                        <span style="color: #cbd5e1; font-size: 1.05rem;"> - ${w.vi}</span>
                    </div>
                    <button class="btn" onclick="playAudio('${safeEn}')" style="background: rgba(59, 130, 246, 0.2); color: #3b82f6; border-radius: 50%; width: 40px; height: 40px; padding: 0; display: flex; align-items: center; justify-content: center;">🔊</button>
                </div>
                <div id="${dictId}" style="margin-top: 8px; font-size: 0.95rem; color: #94a3b8; display: none; line-height: 1.4;"></div>
            `;
            reviewList.appendChild(li);
            
            // Gọi API Từ điển miễn phí để lấy phiên âm và ví dụ
            fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${w.en}`)
                .then(res => res.json())
                .then(dictData => {
                    if(Array.isArray(dictData) && dictData[0]) {
                        // Tìm phiên âm
                        let ipa = dictData[0].phonetic || '';
                        if(!ipa && dictData[0].phonetics) {
                            const p = dictData[0].phonetics.find(x => x.text);
                            if(p) ipa = p.text;
                        }
                        
                        // Tìm câu ví dụ đầu tiên
                        let example = '';
                        if(dictData[0].meanings) {
                            for(let m of dictData[0].meanings) {
                                if(m.definitions) {
                                    const def = m.definitions.find(d => d.example);
                                    if(def) { example = def.example; break; }
                                }
                            }
                        }
                        
                        const dictEl = document.getElementById(dictId);
                        if(dictEl && (ipa || example)) {
                            dictEl.style.display = 'block';
                            let html = '';
                            if(ipa) html += `<span style="color: #38bdf8; font-family: monospace;">Phiên âm: ${ipa}</span><br>`;
                            if(example) html += `<span style="color: #a7f3d0; font-style: italic;">Ví dụ: "${example}"</span>`;
                            dictEl.innerHTML = html;
                        }
                    }
                }).catch(e => console.log('Dictionary fetch error for', w.en));
        });
    }
});

const btnShowReview = document.getElementById('btn-show-review');
const btnBackToLobby = document.getElementById('btn-back-to-lobby');

if (btnShowReview && reviewScreen) {
    btnShowReview.addEventListener('click', () => {
        showScreen(reviewScreen);
    });
}

if (btnBackToLobby) {
    btnBackToLobby.addEventListener('click', () => {
        window.location.reload();
    });
}

if (btnPlayAgain) {
    btnPlayAgain.addEventListener('click', () => {
        window.location.reload();
    });
}

// Emoji Handlers
const emojiBtns = document.querySelectorAll('.emoji-btn');
const emojiLayer = document.getElementById('emoji-layer');
let emojiCooldown = false;

emojiBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        if (emojiCooldown) return;
        const emoji = btn.dataset.emoji;
        if (currentRoomCode) {
            socket.emit('send_emoji', { room_code: currentRoomCode, emoji: emoji });
        }
        
        emojiCooldown = true;
        setTimeout(() => emojiCooldown = false, 500); // Cooldown 0.5s để chống spam
    });
});

socket.on('receive_emoji', (data) => {
    const el = document.createElement('div');
    el.className = 'floating-emoji';
    el.textContent = data.emoji;
    
    // Vị trí ngẫu nhiên chiều ngang từ 10% đến 90%
    const randomX = Math.floor(Math.random() * 80) + 10;
    el.style.left = randomX + 'vw';
    
    // Xoay ngẫu nhiên từ -20 đến 20 độ để tự nhiên hơn
    const randomRotate = Math.floor(Math.random() * 40) - 20;
    el.style.transform = `rotate(${randomRotate}deg)`;
    
    if (emojiLayer) {
        emojiLayer.appendChild(el);
    } else {
        document.body.appendChild(el);
    }
    
    // Tự xóa phần tử sau khi animation (2.5s) kết thúc
    setTimeout(() => {
        el.remove();
    }, 2600);
});

// --- LEADERBOARD & ADMIN SKILLS ---

const btnShowLeaderboard = document.getElementById('btn-show-leaderboard');
const leaderboardContainer = document.getElementById('leaderboard-container');
const leaderboardList = document.getElementById('leaderboard-list');

if (btnShowLeaderboard) {
    btnShowLeaderboard.addEventListener('click', () => {
        if (leaderboardContainer.style.display === 'none') {
            socket.emit('request_leaderboard');
            leaderboardContainer.style.display = 'block';
            btnShowLeaderboard.textContent = 'Ẩn Bảng Xếp Hạng';
        } else {
            leaderboardContainer.style.display = 'none';
            btnShowLeaderboard.textContent = 'Xem Cao Thủ';
        }
    });
}

socket.on('leaderboard_data', (data) => {
    if (!leaderboardList) return;
    leaderboardList.innerHTML = '';
    data.forEach((u, index) => {
        const rank = getRankInfo(u.elo);
        const li = document.createElement('li');
        li.style.padding = '10px 0';
        li.style.borderBottom = '1px solid #334155';
        li.style.display = 'flex';
        li.style.justifyContent = 'space-between';
        
        let medal = '';
        if (index === 0) medal = '🏆';
        else if (index === 1) medal = '🥈';
        else if (index === 2) medal = '🥉';
        
        li.innerHTML = `<span><strong style="color: #fbbf24;">#${index + 1}</strong> ${medal} <strong>${u.name}</strong></span> <span style="color: #fbbf24;">${u.elo} ${rank.badge}</span>`;
        leaderboardList.appendChild(li);
    });
});

document.querySelectorAll('.btn-admin-skill').forEach(btn => {
    btn.addEventListener('click', () => {
        if (!isAdmin) return;
        const skill = btn.dataset.skill;
        socket.emit('admin_skill', {room_code: currentRoomCode, skill: skill, session_id: mySessionId});
        
        // Hiệu ứng click
        btn.style.transform = 'scale(0.9)';
        setTimeout(() => btn.style.transform = 'scale(1)', 150);
        
        // Báo cho Admin biết đã tung chiêu
        if (skill === 'freeze') {
            resultMessage.textContent = '❄️ Đã tung chiêu Đóng Băng phòng!';
            resultMessage.className = 'result-message success';
        }
    });
});

socket.on('skill_freeze', (data) => {
    if (data.sender_id !== mySessionId && !isAdmin) {
        answerInput.disabled = true;
        answerInput.value = '';
        answerInput.placeholder = '🥶 Bạn đã bị Admin ĐÓNG BĂNG!';
        answerInput.style.background = '#e0f2fe';
        if (btnSubmit) btnSubmit.disabled = true;
        
        setTimeout(() => {
            answerInput.disabled = false;
            answerInput.placeholder = 'Nhập đáp án...';
            answerInput.style.background = ''; // Xóa style để nó trở về màu mặc định của nền tối
            if (btnSubmit) btnSubmit.disabled = false;
            answerInput.focus();
        }, 3000);
    }
});

socket.on('skill_auto_correct', (data) => {
    answerInput.value = data.answer;
    submitAnswer();
});

// --- KIỂM TRA SPEAKING (PRONUNCIATION TEST) ---
const btnShowSpeaking = document.getElementById('btn-show-speaking');
const btnBackFromSpeaking = document.getElementById('btn-back-from-speaking');
const btnStartSpeaking = document.getElementById('btn-start-speaking');
const speakingTarget = document.getElementById('speaking-target');
const speakingStatus = document.getElementById('speaking-status');
const speakingResultContainer = document.getElementById('speaking-result-container');
const speakingScore = document.getElementById('speaking-score');
const speakingFeedback = document.getElementById('speaking-feedback');

let speakingRecognition = null;
if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
    const SpeechRecog = window.SpeechRecognition || window.webkitSpeechRecognition;
    speakingRecognition = new SpeechRecog();
    speakingRecognition.lang = 'en-US';
    speakingRecognition.continuous = false;
    speakingRecognition.interimResults = false;
    
    speakingRecognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        speakingStatus.textContent = 'Đang phân tích độ chuẩn xác...';
        socket.emit('check_speaking', { expected: speakingTarget.value, actual: transcript });
        
        // Ép tắt Micro ngay lập tức (giải quyết lỗi treo Micro trên điện thoại)
        try { speakingRecognition.stop(); } catch(e) {}
        
        // Trả lại giao diện nút mic
        btnStartSpeaking.style.background = '#3b82f6';
        btnStartSpeaking.style.transform = 'scale(1)';
        btnStartSpeaking.style.boxShadow = '0 4px 15px rgba(59, 130, 246, 0.4)';
    };
    
    speakingRecognition.onerror = (event) => { 
        let errorMsg = 'Không nghe rõ, thử lại nhé!';
        if (event.error === 'not-allowed') errorMsg = 'Chưa cấp quyền Micro!';
        else if (event.error === 'network') errorMsg = 'Lỗi mạng (Apple server)!';
        else if (event.error === 'no-speech') errorMsg = 'Chưa nghe thấy tiếng!';
        else if (event.error) errorMsg = 'Lỗi: ' + event.error;
        
        speakingStatus.textContent = errorMsg; 
        btnStartSpeaking.style.background = '#3b82f6'; 
        btnStartSpeaking.style.transform = 'scale(1)';
        try { speakingRecognition.stop(); } catch(e) {}
    };
    speakingRecognition.onend = () => { 
        btnStartSpeaking.style.background = '#3b82f6'; 
        btnStartSpeaking.style.transform = 'scale(1)';
    };
}

if (btnShowSpeaking) {
    btnShowSpeaking.addEventListener('click', () => {
        showScreen(speakingScreen);
        speakingTarget.value = '';
        speakingResultContainer.style.display = 'none';
        speakingStatus.textContent = 'Nhấn Micro để đọc';
    });
}

if (btnBackFromSpeaking) {
    btnBackFromSpeaking.addEventListener('click', () => {
        showScreen(lobbyScreen);
    });
}

if (btnStartSpeaking) {
    btnStartSpeaking.addEventListener('click', () => {
        if (!speakingTarget.value.trim()) {
            alert('Vui lòng nhập câu Tiếng Anh bạn cần kiểm tra vào ô trên nhé!');
            return;
        }
        if (speakingRecognition) {
            btnStartSpeaking.style.background = '#ef4444'; // Đỏ báo đang thu
            btnStartSpeaking.style.transform = 'scale(1.1)';
            btnStartSpeaking.style.boxShadow = '0 0 20px rgba(239, 68, 68, 0.8)';
            speakingStatus.textContent = 'Đang nghe...';
            speakingRecognition.start();
        } else {
            alert('Trình duyệt của bạn không hỗ trợ Micro (Nên dùng Chrome/Edge/Safari).');
        }
    });
}

socket.on('speaking_result', (data) => {
    speakingStatus.textContent = 'Phân tích hoàn tất!';
    speakingResultContainer.style.display = 'block';
    
    let color = '#ef4444'; // Red
    if (data.score >= 80) color = '#10b981'; // Green
    else if (data.score >= 50) color = '#fbbf24'; // Yellow
    
    speakingScore.textContent = `${data.score}/100`;
    speakingScore.style.color = color;
    speakingScore.style.textShadow = `0 2px 15px ${color}40`;
    
    speakingFeedback.innerHTML = '';
    data.feedback.forEach(item => {
        const span = document.createElement('span');
        span.textContent = item.word + ' ';
        if (item.status === 'correct') {
            span.style.color = '#10b981';
            span.style.fontWeight = 'bold';
        } else {
            span.style.color = '#ef4444';
            span.style.textDecoration = 'underline';
        }
        speakingFeedback.appendChild(span);
    });
});
// --- TINDER FLASHCARDS ---
const flashcardScreen = document.getElementById('flashcard-screen');
const btnFlashcards = document.getElementById('btn-flashcards');
const btnBackFromFlashcards = document.getElementById('btn-back-from-flashcards');
const flashcardContainer = document.getElementById('flashcard-container');
const btnSwipeLeft = document.getElementById('btn-swipe-left');
const btnSwipeRight = document.getElementById('btn-swipe-right');
const btnFlashcardSpeak = document.getElementById('btn-flashcard-speak');
const flashcardProgress = document.getElementById('flashcard-progress');
const flashcardDoneMsg = document.getElementById('flashcard-done-msg');
const btnFlashcardFinish = document.getElementById('btn-flashcard-finish');

const flashcardCustomIdInput = document.getElementById('flashcard-custom-id');
const btnFlashcardsCustom = document.getElementById('btn-flashcards-custom');

let flashcardsList = [];
let currentFlashcardIndex = 0;

if (btnFlashcards) {
    btnFlashcards.addEventListener('click', () => {
        showScreen(flashcardScreen);
        flashcardContainer.innerHTML = '';
        flashcardContainer.style.display = 'block';
        flashcardDoneMsg.style.display = 'none';
        btnSwipeLeft.style.display = 'flex';
        btnSwipeRight.style.display = 'flex';
        flashcardProgress.textContent = 'Đang tải...';
        socket.emit('request_flashcards', { session_id: mySessionId });
    });
}

if (btnFlashcardsCustom) {
    btnFlashcardsCustom.addEventListener('click', () => {
        const setId = flashcardCustomIdInput.value.trim().toUpperCase();
        if (!setId) {
            alert('Vui lòng nhập mã bộ từ vựng!');
            return;
        }
        
        showScreen(flashcardScreen);
        flashcardContainer.innerHTML = '';
        flashcardContainer.style.display = 'block';
        flashcardDoneMsg.style.display = 'none';
        btnSwipeLeft.style.display = 'flex';
        btnSwipeRight.style.display = 'flex';
        flashcardProgress.textContent = 'Đang tải...';
        
        socket.emit('request_custom_flashcards', { set_id: setId });
    });
}

if (btnBackFromFlashcards) {
    btnBackFromFlashcards.addEventListener('click', () => {
        showScreen(lobbyScreen);
    });
}

if (btnFlashcardFinish) {
    btnFlashcardFinish.addEventListener('click', () => {
        showScreen(lobbyScreen);
        // Cập nhật lại số liệu
        socket.emit('request_user_stats', { session_id: mySessionId });
    });
}

socket.on('flashcards_data', (data) => {
    flashcardsList = data;
    currentFlashcardIndex = 0;
    
    if (flashcardsList.length === 0) {
        flashcardProgress.textContent = '0/0';
        flashcardContainer.style.display = 'none';
        btnSwipeLeft.style.display = 'none';
        btnSwipeRight.style.display = 'none';
        flashcardDoneMsg.style.display = 'block';
        flashcardDoneMsg.querySelector('p').textContent = 'Không tìm thấy thẻ nào (hoặc mã không tồn tại / chưa đến hạn ôn).';
        return;
    }
    
    renderFlashcards();
});

function renderFlashcards() {
    flashcardContainer.innerHTML = '';
    
    if (currentFlashcardIndex >= flashcardsList.length) {
        flashcardProgress.textContent = `${flashcardsList.length}/${flashcardsList.length}`;
        flashcardContainer.style.display = 'none';
        btnSwipeLeft.style.display = 'none';
        btnSwipeRight.style.display = 'none';
        flashcardDoneMsg.style.display = 'block';
        return;
    }
    
    flashcardProgress.textContent = `${currentFlashcardIndex + 1}/${flashcardsList.length}`;
    
    // Render tối đa 3 thẻ để tạo hiệu ứng xếp chồng (từ dưới lên trên)
    const maxRender = Math.min(3, flashcardsList.length - currentFlashcardIndex);
    
    for (let i = maxRender - 1; i >= 0; i--) {
        const index = currentFlashcardIndex + i;
        const wordData = flashcardsList[index];
        const isTopCard = (i === 0);
        
        const cardEl = document.createElement('div');
        cardEl.className = 'tinder-card';
        // Hiệu ứng xếp chồng
        const scale = 1 - (i * 0.05);
        const translateY = i * 15;
        cardEl.style.transform = `scale(${scale}) translateY(${translateY}px)`;
        cardEl.style.zIndex = 100 - i;
        
        let sentenceHtml = '';
        if (wordData.sentence) {
            sentenceHtml = `<div class="card-sentence">Ví dụ: ${wordData.sentence.replace('_____', '...')}</div>`;
        }
        
        cardEl.innerHTML = `
            <div class="front">
                <div class="card-en">${wordData.en}</div>
                <div style="color: var(--text-muted); font-size: 0.9rem; margin-top: 20px;">(Chạm để lật)</div>
                <div class="flashcard-stamp stamp-nope">QUÊN</div>
                <div class="flashcard-stamp stamp-like">ĐÃ NHỚ</div>
            </div>
            <div class="back">
                <div class="card-vi">${wordData.vi}</div>
                ${sentenceHtml}
                <div style="color: var(--text-muted); font-size: 0.9rem; margin-top: 20px;">(Chạm để lật)</div>
            </div>
        `;
        
        flashcardContainer.appendChild(cardEl);
        
        if (isTopCard) {
            initHammerForCard(cardEl, wordData);
        }
    }
}

function initHammerForCard(cardEl, wordData) {
    const hammer = new Hammer(cardEl);
    let isFlipped = false;
    const nopeStamp = cardEl.querySelector('.stamp-nope');
    const likeStamp = cardEl.querySelector('.stamp-like');
    
    // Xử lý lật thẻ
    hammer.on('tap', () => {
        isFlipped = !isFlipped;
        if (isFlipped) {
            cardEl.classList.add('flipped');
        } else {
            cardEl.classList.remove('flipped');
        }
        // Đọc từ vựng khi lật
        playAudio(wordData.en);
    });
    
    // Xử lý kéo thả (Swipe)
    hammer.on('pan', (ev) => {
        cardEl.classList.add('moving');
        if (ev.deltaX === 0) return;
        if (ev.center.x === 0 && ev.center.y === 0) return; // Fix bug occasionally returning 0
        
        // Di chuyển thẻ
        const rotate = ev.deltaX * 0.05;
        cardEl.style.transform = `translate(${ev.deltaX}px, ${ev.deltaY}px) rotate(${rotate}deg)`;
        
        // Hiển thị stamp tùy theo hướng kéo
        if (ev.deltaX > 50) {
            likeStamp.style.opacity = Math.min(1, ev.deltaX / 100);
            nopeStamp.style.opacity = 0;
        } else if (ev.deltaX < -50) {
            nopeStamp.style.opacity = Math.min(1, Math.abs(ev.deltaX) / 100);
            likeStamp.style.opacity = 0;
        } else {
            likeStamp.style.opacity = 0;
            nopeStamp.style.opacity = 0;
        }
    });
    
    hammer.on('panend', (ev) => {
        cardEl.classList.remove('moving');
        const threshold = window.innerWidth * 0.25; // Kéo qua 25% màn hình là tính
        
        if (ev.deltaX > threshold) {
            // Vuốt phải -> Đã nhớ
            throwCard(cardEl, 1000, ev.deltaY, 'remembered', wordData);
        } else if (ev.deltaX < -threshold) {
            // Vuốt trái -> Quên
            throwCard(cardEl, -1000, ev.deltaY, 'forgot', wordData);
        } else {
            // Hủy vuốt, đưa về chỗ cũ
            cardEl.style.transform = `translate(0px, 0px) rotate(0deg)`;
            likeStamp.style.opacity = 0;
            nopeStamp.style.opacity = 0;
        }
    });
}

function throwCard(cardEl, x, y, status, wordData) {
    cardEl.style.transition = 'transform 0.5s cubic-bezier(0.2, 0.8, 0.2, 1), opacity 0.5s';
    cardEl.style.transform = `translate(${x}px, ${y}px) rotate(${x * 0.1}deg)`;
    cardEl.style.opacity = 0;
    
    // Gửi kết quả về server
    socket.emit('flashcard_result', {
        session_id: mySessionId,
        en: wordData.en,
        status: status
    });
    
    setTimeout(() => {
        currentFlashcardIndex++;
        renderFlashcards();
    }, 300);
}

// Gắn sự kiện cho các nút bấm bên dưới
if (btnSwipeLeft) {
    btnSwipeLeft.addEventListener('click', () => {
        const topCard = document.querySelector('.tinder-card:last-child');
        if (topCard && currentFlashcardIndex < flashcardsList.length) {
            throwCard(topCard, -1000, -100, 'forgot', flashcardsList[currentFlashcardIndex]);
        }
    });
}

if (btnSwipeRight) {
    btnSwipeRight.addEventListener('click', () => {
        const topCard = document.querySelector('.tinder-card:last-child');
        if (topCard && currentFlashcardIndex < flashcardsList.length) {
            throwCard(topCard, 1000, -100, 'remembered', flashcardsList[currentFlashcardIndex]);
        }
    });
}

if (btnFlashcardSpeak) {
    btnFlashcardSpeak.addEventListener('click', () => {
        if (currentFlashcardIndex < flashcardsList.length) {
            playAudio(flashcardsList[currentFlashcardIndex].en);
            
            // Animation
            btnFlashcardSpeak.style.transform = 'scale(0.9)';
            setTimeout(() => btnFlashcardSpeak.style.transform = 'scale(1)', 150);
        }
    });
}

// --- READING & OCR ---
const readingScreen = document.getElementById('reading-screen');
const btnShowReading = document.getElementById('btn-show-reading');
const btnBackFromReading = document.getElementById('btn-back-from-reading');
const readingPassageSelect = document.getElementById('reading-passage-select');
const readingImageUpload = document.getElementById('reading-image-upload');
const ocrStatus = document.getElementById('ocr-status');
const readingTextContainer = document.getElementById('reading-text-container');
const btnExportReadingVocab = document.getElementById('btn-export-reading-vocab');
const translatePopup = document.getElementById('translate-popup');
const popupWordEn = document.getElementById('popup-word-en');
const popupWordVi = document.getElementById('popup-word-vi');
const btnClosePopup = document.getElementById('btn-close-popup');
const btnSavePopupWord = document.getElementById('btn-save-popup-word');

let readingCart = [];

const samplePassages = {
    'easy': `The history of chocolate begins in Mesoamerica. Fermented beverages made from chocolate date back to 450 BC. The Aztecs believed that cacao seeds were the gift of Quetzalcoatl, the god of wisdom, and the seeds once had so much value that they were used as a form of currency. Originally prepared only as a drink, chocolate was served bitter, mixed with spices or corn puree. It was believed to have aphrodisiac powers and to give the drinker strength. Today, such drinks are also known as "Chilate" and are made by locals in the South of Mexico.`,
    'medium': `The future of renewable energy is rapidly evolving as technologies like solar and wind power become more affordable and efficient. Governments worldwide are investing heavily in green infrastructure to combat climate change and reduce carbon emissions. Innovations in battery storage allow grids to store surplus energy, ensuring a continuous supply even when the sun isn't shining or the wind isn't blowing. However, transitioning away from fossil fuels poses significant economic and logistical challenges that require global cooperation.`,
    'hard': `Neuroplasticity refers to the brain's remarkable ability to reorganize itself by forming new neural connections throughout life. This phenomenon allows the neurons (nerve cells) in the brain to compensate for injury and disease and to adjust their activities in response to new situations or to changes in their environment. Brain reorganization takes place by mechanisms such as "axonal sprouting" in which undamaged axons grow new nerve endings to reconnect neurons whose links were injured or severed. Undamaged axons can also sprout nerve endings and connect with other undamaged nerve cells, forming new neural pathways to accomplish a needed function.`
};

// Hàm hỗ trợ render text để có thể click từng từ trên mobile
function renderTranslatableText(text) {
    const words = text.split(/(\s+)/);
    const html = words.map(w => {
        if (w.trim() === '') return w;
        const safeW = w.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        return `<span class="translatable-word" style="cursor: pointer; border-radius: 4px; transition: background 0.2s;">${safeW}</span>`;
    }).join('');
    readingTextContainer.innerHTML = `<p style="line-height: 1.8; font-size: 1.1rem; color: white; white-space: pre-wrap;">${html}</p>`;
}

if (btnShowReading) {
    btnShowReading.addEventListener('click', () => {
        showScreen(readingScreen);
        translatePopup.style.display = 'none';
    });
}

if (btnBackFromReading) {
    btnBackFromReading.addEventListener('click', () => {
        showScreen(lobbyScreen);
        translatePopup.style.display = 'none';
    });
}

if (readingPassageSelect) {
    readingPassageSelect.addEventListener('change', (e) => {
        const val = e.target.value;
        if (samplePassages[val]) {
            // Hiển thị bài đọc
            renderTranslatableText(samplePassages[val]);
            readingImageUpload.value = ''; // Reset file upload
        }
    });
}

if (readingImageUpload) {
    readingImageUpload.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        readingPassageSelect.value = ''; // Reset select
        ocrStatus.style.display = 'block';
        readingTextContainer.innerHTML = `<p style="color: var(--text-muted); text-align: center; margin-top: 50px;">Đang xử lý tài liệu... Tùy dung lượng mà có thể mất vài giây.</p>`;
        
        try {
            if (file.type.startsWith('image/')) {
                // Xử lý Ảnh bằng Tesseract OCR
                const worker = await Tesseract.createWorker('eng');
                const ret = await worker.recognize(file);
                await worker.terminate();
                
                ocrStatus.style.display = 'none';
                renderTranslatableText(ret.data.text);
            } else if (file.type === 'application/pdf') {
                // Xử lý PDF bằng PDF.js
                pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
                const arrayBuffer = await file.arrayBuffer();
                const pdf = await pdfjsLib.getDocument(arrayBuffer).promise;
                
                const maxPages = Math.min(pdf.numPages, 10); // Đọc tối đa 10 trang để tránh lag
                let fullText = '';
                
                for (let i = 1; i <= maxPages; i++) {
                    const page = await pdf.getPage(i);
                    const content = await page.getTextContent();
                    const strings = content.items.map(item => item.str);
                    fullText += strings.join(' ') + '\\n\\n';
                }
                
                ocrStatus.style.display = 'none';
                renderTranslatableText(fullText);
            } else if (file.type === 'text/plain') {
                // Xử lý file text TXT
                const text = await file.text();
                ocrStatus.style.display = 'none';
                renderTranslatableText(text);
            } else {
                throw new Error('Định dạng file không được hỗ trợ! Vui lòng chọn Ảnh, PDF hoặc TXT.');
            }
        } catch (error) {
            ocrStatus.style.display = 'none';
            readingTextContainer.innerHTML = `<p style="color: #ef4444; text-align: center; margin-top: 50px;">Lỗi: ${error.message}</p>`;
            console.error(error);
        }
    });
}

// Helper hiển thị popup dịch
let currentTranslateWord = '';
async function showTranslationPopup(word, x, y) {
    currentTranslateWord = word;
    
    // Hiện popup với chữ loading
    translatePopup.style.display = 'block';
    
    // Nếu là Mobile (chiều rộng nhỏ), ghim hẳn xuống đáy màn hình để không bị đè bởi Menu iOS (Sao chép, Tra cứu...)
    if (window.innerWidth < 768) {
        translatePopup.style.position = 'fixed';
        translatePopup.style.bottom = '20px';
        translatePopup.style.top = 'auto';
        translatePopup.style.left = '50%';
        translatePopup.style.transform = 'translateX(-50%)';
        translatePopup.style.width = '90%';
        translatePopup.style.zIndex = '9999';
        translatePopup.style.boxShadow = '0 -5px 25px rgba(0,0,0,0.8)';
    } else {
        // Desktop: Hiển thị ngay dưới con trỏ chuột
        translatePopup.style.position = 'absolute';
        translatePopup.style.top = `${y + 10}px`;
        translatePopup.style.left = `${x}px`;
        translatePopup.style.bottom = 'auto';
        translatePopup.style.transform = 'none';
        translatePopup.style.width = '240px';
        
        // Giới hạn popup không bị tràn màn hình
        const popupRect = translatePopup.getBoundingClientRect();
        if (popupRect.right > window.innerWidth) {
            translatePopup.style.left = `${window.innerWidth - popupRect.width - 10}px`;
        }
    }
    
    // Hiển thị text lên popup (cắt gọn nếu quá dài)
    let displayWord = word;
    if (displayWord.length > 40) displayWord = displayWord.substring(0, 40) + '...';
    popupWordEn.textContent = displayWord;
    
    popupWordVi.textContent = 'Đang dịch...';
    btnSavePopupWord.style.display = 'none';
    
    // Gọi API dịch MyMemory (Free)
    try {
        const res = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(word)}&langpair=en|vi`);
        const data = await res.json();
        if (data.responseData && data.responseData.translatedText) {
            popupWordVi.textContent = data.responseData.translatedText;
            btnSavePopupWord.style.display = 'block';
        } else {
            popupWordVi.textContent = 'Không tìm thấy nghĩa.';
        }
    } catch (err) {
        popupWordVi.textContent = 'Lỗi kết nối mạng.';
    }
}

// Xử lý SINGLE CLICK (Chạm) để dịch 1 từ trên Mobile (tránh bị hiện menu Select của đt)
if (readingTextContainer) {
    readingTextContainer.addEventListener('click', async (e) => {
        // Nếu user đang bôi đen text thì KHÔNG trigger click (để dành cho mouseup xử lý cụm từ)
        if (window.getSelection().toString().trim().length > 0) return;

        if (e.target.classList.contains('translatable-word')) {
            const word = e.target.innerText.trim().replace(/[^a-zA-Z]/g, '');
            if (word && word.length > 1) {
                // Highlight the word temporarily
                const originalBg = e.target.style.backgroundColor;
                e.target.style.backgroundColor = 'rgba(236, 72, 153, 0.5)';
                setTimeout(() => e.target.style.backgroundColor = originalBg, 2000);
                
                showTranslationPopup(word, e.pageX, e.pageY);
            }
        }
    });
}

// Xử lý Bôi đen để dịch nguyên cụm (Dùng selectionchange để hoạt động chuẩn xác trên iOS)
document.addEventListener('selectionchange', () => {
    clearTimeout(window.selectionTimeout);
    window.selectionTimeout = setTimeout(() => {
        const selection = window.getSelection();
        if (!selection || selection.isCollapsed) return;
        
        if (readingTextContainer && readingTextContainer.contains(selection.anchorNode)) {
            const word = selection.toString().trim();
            if (word && word.length > 1 && word.includes(' ')) {
                // Xác định vị trí (cho PC, mobile sẽ tự ghi đè ở hàm showTranslationPopup)
                let x = 0, y = 0;
                if (selection.rangeCount > 0) {
                    const rect = selection.getRangeAt(0).getBoundingClientRect();
                    x = rect.left + window.scrollX;
                    y = rect.bottom + window.scrollY;
                }
                showTranslationPopup(word, x, y);
            }
        }
    }, 400); // Đợi 400ms để chắc chắn user đã bôi đen xong
});

if (btnClosePopup) {
    btnClosePopup.addEventListener('click', () => {
        translatePopup.style.display = 'none';
    });
}

if (btnSavePopupWord) {
    btnSavePopupWord.addEventListener('click', () => {
        if (!currentTranslateWord) return;
        
        // Kiểm tra xem đã có trong giỏ chưa
        const exists = readingCart.find(w => w.en.toLowerCase() === currentTranslateWord);
        if (!exists) {
            readingCart.push({
                en: currentTranslateWord,
                vi: popupWordVi.textContent,
                sentence: ''
            });
            btnExportReadingVocab.textContent = `🛒 Giỏ từ (${readingCart.length})`;
            
            // Effect
            btnSavePopupWord.textContent = '✓ Đã thêm';
            btnSavePopupWord.style.background = '#3b82f6';
            setTimeout(() => {
                translatePopup.style.display = 'none';
                btnSavePopupWord.textContent = '+ Thêm vào Giỏ';
                btnSavePopupWord.style.background = '#10b981';
            }, 1000);
        } else {
            alert('Từ này đã có trong giỏ của bạn rồi!');
        }
    });
}

if (btnExportReadingVocab) {
    btnExportReadingVocab.addEventListener('click', () => {
        if (readingCart.length === 0) {
            alert('Giỏ từ của bạn đang trống! Hãy bôi đen từ nào đó trong bài đọc để thêm vào giỏ nhé.');
            return;
        }
        
        socket.emit('save_custom_vocab', { pairs: readingCart });
    });
}

socket.on('vocab_saved', (data) => {
    // Only handle if we have items in our cart, meaning we just saved reading cart
    if (readingCart.length > 0) {
        alert(`🎉 Chúc mừng! Bạn đã tạo thành công bộ từ vựng.\\n\\nMÃ BỘ TỪ CỦA BẠN: ${data.set_id}\\n\\nHãy sao chép mã này và ra ngoài sảnh dùng tính năng [Tinder Flashcards] -> [Ôn mã này] nhé!`);
        
        // Reset giỏ
        readingCart = [];
        btnExportReadingVocab.textContent = `🛒 Giỏ từ (0)`;
        translatePopup.style.display = 'none';
    }
});
