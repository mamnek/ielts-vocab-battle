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
    englishWordEl.textContent = data.word;
    englishWordEl.dataset.originalEn = data.original_en;
    englishWordEl.dataset.qType = data.q_type;
    
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
});

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
