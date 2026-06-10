const socket = io();

// Các giao diện màn hình
const lobbyScreen = document.getElementById('lobby-screen');
const waitingScreen = document.getElementById('waiting-screen');
const arenaScreen = document.getElementById('arena-screen');
const createVocabScreen = document.getElementById('create-vocab-screen');

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
const countdownEl = document.getElementById('countdown');
const englishWordEl = document.getElementById('english-word');
const btnSpeak = document.getElementById('btn-speak');
const answerInput = document.getElementById('answer-input');
const btnSubmit = document.getElementById('btn-submit');
const resultMessage = document.getElementById('result-message');

let currentRoomCode = '';
let myName = '';
let timerInterval;

// Khởi tạo 1 session ID cố định cho người dùng này (để reconnect khi load lại tab)
let mySessionId = localStorage.getItem('ielts_arena_session_id');
if (!mySessionId) {
    mySessionId = Math.random().toString(36).substring(2, 15);
    localStorage.setItem('ielts_arena_session_id', mySessionId);
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
}

function getPlayerName() {
    return playerNameInput.value.trim() || 'Guest_' + Math.floor(Math.random() * 1000);
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
        session_id: mySessionId
    });
});

// Bắt sự kiện tham gia
btnJoin.addEventListener('click', () => {
    const code = roomCodeInput.value.trim();
    if (!code) return lobbyMessage.textContent = 'Vui lòng nhập mã phòng!';
    myName = getPlayerName();
    socket.emit('join_room', { name: myName, room_code: code, session_id: mySessionId });
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


// --- LẮNG NGHE SỰ KIỆN TỪ SERVER ---

socket.on('connect', () => {
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

socket.on('room_joined', (data) => { currentRoomCode = data.room_code; });

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
    
    const players = data.players;
    player1Name.textContent = players[0].name;
    player1Score.textContent = players[0].score;
    
    if (players[1]) {
        document.getElementById('player2-score').style.display = 'flex';
        player2Name.textContent = players[1].name;
        player2Score.textContent = players[1].score;
    } else {
        document.getElementById('player2-score').style.display = 'none';
    }
});

const currentQDisplay = document.getElementById('current-q-display');
const totalQDisplay = document.getElementById('total-q-display');

// Bắt đầu vòng mới: hiển thị từ mới và reset UI
socket.on('new_word', (data) => {
    englishWordEl.textContent = data.word;
    englishWordEl.dataset.originalEn = data.original_en;
    englishWordEl.dataset.qType = data.q_type;
    
    if (data.q_type === 'vi-en') {
        answerInput.placeholder = 'Nhập từ tiếng Anh (VD: hello)';
        if (btnSpeak) btnSpeak.style.display = 'none'; // Không hiển thị lúc đang hỏi
    } else {
        answerInput.placeholder = 'Nhập nghĩa tiếng Việt (VD: xin chào)';
        if (btnSpeak) btnSpeak.style.display = 'flex';
        playAudio(data.original_en);
    }

    if (currentQDisplay && totalQDisplay) {
        currentQDisplay.textContent = data.current_q;
        totalQDisplay.textContent = data.total_q;
    }
    answerInput.disabled = false;
    btnSubmit.disabled = false;
    answerInput.value = ''; // Xóa chữ gõ dở từ vòng trước
    answerInput.focus();
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
        }
    }, 1000);
});

// Xử lý khi có người trả lời đúng
socket.on('correct_answer', (data) => {
    clearInterval(timerInterval);
    answerInput.disabled = true;
    btnSubmit.disabled = true;
    
    resultMessage.textContent = `🎯 ${data.winner} +10đ! Đáp án: ${data.correct_answer}`;
    resultMessage.className = 'result-message success';
    
    // Cập nhật điểm ngay lập tức
    const players = data.players;
    player1Score.textContent = players[0].score;
    if (players[1]) player2Score.textContent = players[1].score;
    
    if (englishWordEl.dataset.qType === 'vi-en') {
        playAudio(englishWordEl.dataset.originalEn);
        if (btnSpeak) btnSpeak.style.display = 'flex';
    }
});

// Xử lý chế độ sync
socket.on('wait_for_other', (data) => {
    answerInput.disabled = true;
    btnSubmit.disabled = true;
    resultMessage.textContent = `⏳ ${data.message}`;
    resultMessage.className = 'result-message';
    resultMessage.style.color = '#eab308'; // Màu vàng warning
});

socket.on('sync_result', (data) => {
    clearInterval(timerInterval);
    answerInput.disabled = true;
    btnSubmit.disabled = true;
    
    resultMessage.textContent = `🎯 ${data.winners.join(' và ')} đúng! Đáp án: ${data.correct_answer}`;
    resultMessage.className = 'result-message success';
    
    const players = data.players;
    player1Score.textContent = players[0].score;
    if (players[1]) player2Score.textContent = players[1].score;
    
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
const summaryScreen = document.getElementById('summary-screen');
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
        if (players[0].score > players[1].score) {
            winnerNameEl.textContent = `${players[0].name} Thắng! 🎉`;
        } else if (players[0].score < players[1].score) {
            winnerNameEl.textContent = `${players[1].name} Thắng! 🎉`;
        } else {
            winnerNameEl.textContent = 'Hòa Nhau! 🤝';
        }
        finalScoresEl.innerHTML = `
            ${players[0].name}: ${players[0].score} điểm<br>
            ${players[1].name}: ${players[1].score} điểm
        `;
    }
});

if (btnPlayAgain) {
    btnPlayAgain.addEventListener('click', () => {
        window.location.reload();
    });
}
