// State Management
let state = {
    user: null,
    token: localStorage.getItem('token'),
    activeChat: null,
    users: [],
    messages: [],
    searchQuery: '',
    pollInterval: null,
    tempPhone: '',
    socket: null,
    mediaRecorder: null,
    audioChunks: [],
    isRecording: false,
    isRecording: false,
    recordTimer: null,
    recordSeconds: 0,
    lockedChats: [],
    pendingLockUser: null
};

// Global DOM Elements
const authView = document.getElementById('auth-view');
const chatView = document.getElementById('chat-view');
const userList = document.getElementById('user-list');
const messagesContainer = document.getElementById('messages-container');
const messageInput = document.getElementById('message-input');
const sendBtn = document.getElementById('send-btn');
const userSearchInput = document.getElementById('user-search');
const activeChatWindow = document.getElementById('active-chat');
const welcomeWindow = document.getElementById('welcome-window');

// Initialization
async function init() {
    if (state.token) {
        const success = await fetchProfile();
        if (success) {
            showView('chat');
            await fetchLockedChats();
            fetchChatList();
            initSocket();
        } else {
            showView('auth');
        }
    } else {
        showView('auth');
    }
}

// Auth Functions (MOCK OTP)
let resendTimer = null;

function startResendTimer() {
    let timeLeft = 30;
    const timerDisplay = document.getElementById('resend-timer');
    const resendBtnBtn = document.getElementById('resend-btn');

    if (!timerDisplay || !resendBtnBtn) return;

    timerDisplay.classList.remove('hidden');
    resendBtnBtn.classList.add('hidden');
    timerDisplay.style.color = '#94a3b8';

    if (resendTimer) clearInterval(resendTimer);

    resendTimer = setInterval(() => {
        timeLeft--;
        timerDisplay.innerHTML = `<i class="fa-regular fa-clock mr-1 animate-pulse"></i> Resend in ${timeLeft}s`;

        if (timeLeft <= 0) {
            clearInterval(resendTimer);
            timerDisplay.classList.add('hidden');
            resendBtnBtn.classList.remove('hidden');
        }
    }, 1000);
}

async function sendOTP(isResend = false) {
    const phoneInput = document.getElementById('auth-phone');
    const phone = isResend ? state.tempPhone : phoneInput.value.trim();

    if (!phone || phone.length !== 10 || isNaN(phone)) {
        return showToast('Please enter exactly 10 digits');
    }

    const sendBtnEl = document.getElementById('send-otp-btn');
    const originalBtnText = sendBtnEl.innerText;

    sendBtnEl.disabled = true;
    sendBtnEl.innerText = 'Sending...';

    try {
        const res = await fetch('/api/auth/send-otp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone })
        });
        const data = await res.json();

        if (res.ok) {
            state.tempPhone = phone;
            document.getElementById('otp-phone-display').innerText = `OTP sent to ${phone}`;
            document.getElementById('step-phone').classList.add('hidden');
            document.getElementById('step-otp').classList.remove('hidden');

            showToast(isResend ? 'OTP Resent!' : 'OTP Sent!', 'success');
            startResendTimer();

            if (data.debug_otp) {
                console.log('--- DEBUG OTP RECEIVED ---');
                console.log('OTP Code:', data.debug_otp);
                console.log('---------------------------');
                showToast(`Check Console (F12) for OTP: ${data.debug_otp}`, 'success');
            }
        } else {
            showToast(data.message || 'Failed to send OTP');
        }
    } catch (err) {
        showToast('Server connection error. Check if backend is running.');
    } finally {
        sendBtnEl.disabled = false;
        sendBtnEl.innerText = originalBtnText;
    }
}

async function verifyOTP() {
    const otp = document.getElementById('auth-otp').value.trim();
    if (!otp) return showToast('Please enter OTP');

    try {
        const res = await fetch('/api/auth/verify-otp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone: state.tempPhone, otp })
        });
        const data = await res.json();

        if (res.ok) {
            if (data.status === 'needs_profile') {
                document.getElementById('step-otp').classList.add('hidden');
                document.getElementById('step-profile').classList.remove('hidden');
            } else {
                loginSuccess(data);
            }
        } else {
            showToast(data.message || 'Incorrect OTP');
        }
    } catch (err) {
        showToast('Verification failed');
    }
}

async function completeProfile() {
    const name = document.getElementById('profile-name-input').value.trim();
    const username = document.getElementById('profile-username-input').value.trim();
    const otp = document.getElementById('auth-otp').value.trim();

    if (!name || !username) return showToast('Please fill all fields');

    try {
        const res = await fetch('/api/auth/verify-otp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone: state.tempPhone, otp, name, username })
        });
        const data = await res.json();

        if (res.ok) {
            loginSuccess(data);
        } else {
            showToast(data.message || 'Username might be taken');
        }
    } catch (err) {
        showToast('Profile setup failed');
    }
}

function loginSuccess(data) {
    state.token = data.token;
    state.user = data.user;
    localStorage.setItem('token', data.token);
    updateCurrentUserUI();
    showView('chat');
    fetchChatList();
    initSocket();
    showToast('Login successful!', 'success');
}

function initSocket() {
    if (!state.user || state.socket) return;

    state.socket = io();

    state.socket.on('connect', () => {
        console.log('Connected to server via Socket.io');
        state.socket.emit('join', state.user.id);
    });

    state.socket.on('new_message', (msg) => {
        if (state.activeChat && (msg.sender_id === state.activeChat.id || msg.receiver_id === state.activeChat.id)) {
            state.messages.push(msg);
            renderMessages();
            scrollToBottom();
            // Mark as read shiftly
            if (msg.sender_id === state.activeChat.id) {
                markAsRead(state.activeChat.id);
            }
        }
        fetchChatList(); // Update sidebar preview
    });

    state.socket.on('typing', ({ senderId }) => {
        if (state.activeChat && senderId === state.activeChat.id) {
            document.getElementById('typing-indicator').classList.remove('hidden');
        }
    });

    state.socket.on('stop_typing', ({ senderId }) => {
        if (state.activeChat && senderId === state.activeChat.id) {
            document.getElementById('typing-indicator').classList.add('hidden');
        }
    });

    state.socket.on('message_deleted', ({ id }) => {
        state.messages = state.messages.map(m => m.id == id ? { ...m, is_deleted: 1, message: "This message was deleted" } : m);
        renderMessages();
    });

    state.socket.on('messages_read', ({ readerId }) => {
        if (state.activeChat && readerId === state.activeChat.id) {
            state.messages = state.messages.map(m => ({ ...m, is_read: 1 }));
            renderMessages();
        }
    });

    state.socket.on('user_online', (userId) => {
        // Optionially show green dot in user list
    });
}

function backToPhone() {
    document.getElementById('step-otp').classList.add('hidden');
    document.getElementById('step-phone').classList.remove('hidden');
}

function logout() {
    if (!confirm('Are you sure you want to logout?')) return;
    state.token = null;
    state.user = null;
    state.activeChat = null;
    localStorage.removeItem('token');
    if (state.socket) {
        state.socket.disconnect();
        state.socket = null;
    }
    showView('auth');

    // Reset auth steps
    document.getElementById('step-phone').classList.remove('hidden');
    document.getElementById('step-otp').classList.add('hidden');
    document.getElementById('step-profile').classList.add('hidden');
}

async function fetchProfile() {
    try {
        const res = await fetch('/api/users/profile', {
            headers: { 'Authorization': `Bearer ${state.token}` }
        });
        const data = await res.json();
        if (res.ok) {
            state.user = data;
            updateCurrentUserUI();
            return true;
        }
        return false;
    } catch (err) {
        return false;
    }
}

// UI Functions
function showView(view) {
    if (view === 'auth') {
        authView.classList.remove('hidden');
        chatView.classList.add('hidden');
    } else {
        authView.classList.add('hidden');
        chatView.classList.remove('hidden');
    }
}

function updateCurrentUserUI() {
    if (state.user) {
        document.getElementById('current-user-name').innerText = state.user.name;
        document.getElementById('current-user-username').innerText = `@${state.user.username}`;

        const avatarHTML = state.user.profile_photo
            ? `<img src="${state.user.profile_photo}" class="w-full h-full object-cover rounded-xl" alt="Profile">`
            : state.user.name.charAt(0).toUpperCase();

        document.getElementById('current-user-avatar').innerHTML = avatarHTML;

        // Update Profile Drawer
        document.getElementById('profile-name').innerText = state.user.name;
        document.getElementById('profile-username').innerText = `@${state.user.username}`;
        document.getElementById('profile-email').innerText = state.user.email || 'No email set';
        document.getElementById('profile-date').innerText = new Date(state.user.created_at).toLocaleDateString([], { month: 'long', year: 'numeric' });

        const profileAvatarHTML = state.user.profile_photo
            ? `<img src="${state.user.profile_photo}" class="w-full h-full object-cover" alt="Profile">`
            : state.user.name.charAt(0).toUpperCase();
        document.getElementById('profile-avatar').innerHTML = profileAvatarHTML;
    }
}

function toggleProfile() {
    const sidebar = document.getElementById('profile-sidebar');
    sidebar.classList.toggle('translate-x-full');
}

function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    sidebar.classList.toggle('-translate-x-full');
}

// Emoji & Sticker Logic
const commonEmojis = ['😀', '😂', '🥰', '😎', '🤔', '😢', '🔥', '👍', '🙏', '💯', '❤️', '✨', '🎉', '🚀', '🙌', '🤝', '👀', '💡', '🌈', '🍕'];
const stickers = [
    { name: 'Happy Cat', url: 'https://cdn-icons-png.flaticon.com/512/3241/3241285.png' },
    { name: 'Cool Dog', url: 'https://cdn-icons-png.flaticon.com/512/616/616408.png' },
    { name: 'Coffee', url: 'https://cdn-icons-png.flaticon.com/512/590/590610.png' },
    { name: 'Coding', url: 'https://cdn-icons-png.flaticon.com/512/606/606246.png' },
    { name: 'Gift', url: 'https://cdn-icons-png.flaticon.com/512/1041/1041460.png' }
];

function toggleEmojiPicker() {
    const picker = document.getElementById('emoji-picker');
    picker.classList.toggle('hidden');
    if (!picker.classList.contains('hidden')) {
        showPickerTab('emojis');
    }
}

function showPickerTab(tab) {
    const content = document.getElementById('picker-content');
    const tabEmojis = document.getElementById('tab-emojis');
    const tabStickers = document.getElementById('tab-stickers');

    content.innerHTML = '';
    tabEmojis.className = 'flex-1 py-3 text-xs font-bold uppercase tracking-wider transition-all ' + (tab === 'emojis' ? 'text-blue-400 border-b-2 border-blue-400' : 'text-slate-400 hover:text-white');
    tabStickers.className = 'flex-1 py-3 text-xs font-bold uppercase tracking-wider transition-all ' + (tab === 'stickers' ? 'text-blue-400 border-b-2 border-blue-400' : 'text-slate-400 hover:text-white');

    if (tab === 'emojis') {
        const grid = document.createElement('div');
        grid.className = 'grid grid-cols-5 gap-2';
        commonEmojis.forEach(emoji => {
            const btn = document.createElement('button');
            btn.className = 'text-2xl p-2 hover:bg-slate-700/50 rounded-xl transition-all active:scale-90';
            btn.innerText = emoji;
            btn.onclick = () => addEmoji(emoji);
            grid.appendChild(btn);
        });
        content.appendChild(grid);
    } else {
        const grid = document.createElement('div');
        grid.className = 'grid grid-cols-2 gap-3';
        stickers.forEach(sticker => {
            const btn = document.createElement('button');
            btn.className = 'p-2 hover:bg-slate-700/50 rounded-xl transition-all group';
            btn.innerHTML = `<img src="${sticker.url}" class="w-full h-auto rounded-lg group-hover:scale-105 transition-transform" alt="${sticker.name}">`;
            btn.onclick = () => sendSticker(sticker.url);
            grid.appendChild(btn);
        });
        content.appendChild(grid);
    }
}

function addEmoji(emoji) {
    const input = document.getElementById('message-input');
    input.value += emoji;
    input.focus();
}

async function sendSticker(url) {
    if (!state.activeChat) return;
    document.getElementById('emoji-picker').classList.add('hidden');

    try {
        const response = await fetch(url);
        const blob = await response.blob();
        const file = new File([blob], 'sticker.png', { type: 'image/png' });
        sendMessage(file);
    } catch (e) {
        showToast('Failed to send sticker');
    }
}

// Voice Note Functions
async function startRecording() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        state.mediaRecorder = new MediaRecorder(stream);
        state.audioChunks = [];

        state.mediaRecorder.ondataavailable = (event) => {
            state.audioChunks.push(event.data);
        };

        state.mediaRecorder.onstop = async () => {
            if (state.audioChunks.length > 0 && state.isRecording) {
                const audioBlob = new Blob(state.audioChunks, { type: 'audio/webm' });
                const audioFile = new File([audioBlob], 'voice-note.webm', { type: 'audio/webm' });
                sendMessage(audioFile);
            }
            state.isRecording = false;
            updateRecordingUI(false);
        };

        state.mediaRecorder.start();
        state.isRecording = true;
        updateRecordingUI(true);
        startRecordTimer();
    } catch (err) {
        showToast('Microphone access denied');
    }
}

function stopRecording() {
    if (state.mediaRecorder && state.isRecording) {
        state.mediaRecorder.stop();
        state.mediaRecorder.stream.getTracks().forEach(track => track.stop());
    }
}

function cancelRecording() {
    state.isRecording = false; // Prevents sending onstop
    stopRecording();
}

function updateRecordingUI(show) {
    const recordingUI = document.getElementById('recording-ui');
    const msgInput = document.getElementById('message-input');
    const voiceBtn = document.getElementById('voice-btn');

    if (show) {
        recordingUI.classList.remove('hidden');
        msgInput.classList.add('hidden');
        voiceBtn.innerHTML = '<i class="fa-solid fa-circle-stop text-xl"></i>';
        voiceBtn.classList.add('text-red-500');
    } else {
        recordingUI.classList.add('hidden');
        msgInput.classList.remove('hidden');
        voiceBtn.innerHTML = '<i class="fa-solid fa-microphone text-xl"></i>';
        voiceBtn.classList.remove('text-red-500');
        clearInterval(state.recordTimer);
    }
}

function startRecordTimer() {
    state.recordSeconds = 0;
    const timerEl = document.getElementById('record-timer');
    timerEl.innerText = '0:00';
    state.recordTimer = setInterval(() => {
        state.recordSeconds++;
        const mins = Math.floor(state.recordSeconds / 60);
        const secs = state.recordSeconds % 60;
        timerEl.innerText = `${mins}:${secs.toString().padStart(2, '0')}`;
    }, 1000);
}

// Theme Management
function toggleTheme() {
    const body = document.body;
    const icon = document.getElementById('theme-icon');
    const isDark = body.classList.contains('bg-[#0f172a]');

    if (isDark) {
        body.classList.remove('bg-[#0f172a]', 'text-slate-200');
        body.classList.add('bg-slate-50', 'text-slate-900', 'light-mode');
        icon.classList.remove('fa-moon');
        icon.classList.add('fa-sun');
        localStorage.setItem('theme', 'light');
    } else {
        body.classList.remove('bg-slate-50', 'text-slate-900', 'light-mode');
        body.classList.add('bg-[#0f172a]', 'text-slate-200');
        icon.classList.remove('fa-sun');
        icon.classList.add('fa-moon');
        localStorage.setItem('theme', 'dark');
    }
}

if (localStorage.getItem('theme') === 'light') {
    toggleTheme();
}

// Attachment Functions
function handleAttachment(type) {
    const fileInput = document.getElementById('file-input');
    if (type === 'photo') {
        fileInput.accept = "image/*";
    } else {
        fileInput.accept = ".pdf,.doc,.docx,.txt";
    }
    fileInput.click();
    document.getElementById('attach-menu').classList.add('hidden');
}

function toggleAttachMenu() {
    const menu = document.getElementById('attach-menu');
    menu.classList.toggle('hidden');
}

function showToast(message, type = 'error') {
    const toast = document.getElementById('toast');
    const toastMsg = document.getElementById('toast-message');
    const toastIcon = document.getElementById('toast-icon');

    toastMsg.innerText = message;
    toast.className = `fixed bottom-8 left-1/2 -translate-x-1/2 px-6 py-3 rounded-2xl text-white shadow-2xl transition-all duration-300 z-[100] flex items-center gap-3 ${type === 'error' ? 'bg-red-500' : 'bg-green-500'}`;
    toastIcon.className = type === 'error' ? 'fa-solid fa-circle-exclamation' : 'fa-solid fa-circle-check';

    toast.style.opacity = '1';
    toast.style.transform = 'translate(-50%, 0)';

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translate(-50%, 20px)';
    }, 3000);
}

// User & Chat List Functions
async function fetchChatList() {
    try {
        const res = await fetch('/api/messages/chat-list', {
            headers: { 'Authorization': `Bearer ${state.token}` }
        });
        const data = await res.json();
        if (res.ok) {
            state.users = data;
            renderUserList(data);
        }
    } catch (err) {
        console.error('Error fetching chat list', err);
    }
}

async function searchUsers(query) {
    if (!query) {
        fetchChatList();
        return;
    }
    try {
        const res = await fetch(`/api/users/search?query=${query}`, {
            headers: { 'Authorization': `Bearer ${state.token}` }
        });
        const data = await res.json();
        if (res.ok) {
            state.users = data;
            renderUserList(data);
        }
    } catch (err) {
        console.error('Error searching users', err);
    }
}

function renderUserList(users) {
    userList.innerHTML = '';
    if (users.length === 0) {
        userList.innerHTML = '<div class="p-8 text-center text-slate-500 text-sm">No users found.</div>';
        return;
    }

    users.forEach(u => {
        const div = document.createElement('div');
        div.className = `user-item flex items-center gap-4 p-4 rounded-2xl cursor-pointer ${state.activeChat?.id === u.id ? 'active' : ''}`;

        let lastMsg = u.last_message ? u.last_message : 'No messages yet';

        // Hide message preview if locked
        const isLocked = state.lockedChats.includes(u.id);
        if (isLocked) {
            lastMsg = '<i class="fa-solid fa-lock text-slate-500 mr-1"></i> Locked Chat';
        }

        const time = u.last_message_time && !isLocked ? formatRelativeTime(u.last_message_time) : '';
        const avatarHTML = u.profile_photo
            ? `<img src="${u.profile_photo}" class="w-full h-full object-cover rounded-2xl">`
            : u.name.charAt(0).toUpperCase();

        div.innerHTML = `
            <div class="relative min-w-[3rem]">
                <div class="w-12 h-12 rounded-2xl bg-gradient-to-br from-slate-700 to-slate-800 flex items-center justify-center text-white font-bold text-lg shadow-inner overflow-hidden">
                    ${avatarHTML}
                </div>
                ${isLocked ? '<div class="absolute -bottom-1 -right-1 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center border-2 border-[#0f172a] shadow"><i class="fa-solid fa-lock text-[10px] text-white"></i></div>' : ''}
            </div>
            <div class="flex-1 overflow-hidden">
                <div class="flex justify-between items-center mb-1">
                    <h4 class="font-semibold text-white truncate text-sm">${u.name}</h4>
                    <span class="last-message-time">${time}</span>
                </div>
                <p class="last-message-preview truncate">${lastMsg}</p>
            </div>
        `;
        div.onclick = () => selectChat(u);
        userList.appendChild(div);
    });
}

function formatRelativeTime(dateStr) {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = (now - date) / 1000;

    if (diff < 60) return 'now';
    if (diff < 3600) return Math.floor(diff / 60) + 'm';
    if (diff < 86400) return Math.floor(diff / 3600) + 'h';
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function selectChat(user) {
    if (state.lockedChats.includes(user.id)) {
        showLockModal(user);
        return;
    }

    proceedSelectChat(user);
}

function proceedSelectChat(user) {
    state.activeChat = user;
    welcomeWindow.classList.add('hidden');
    activeChatWindow.classList.remove('hidden');

    if (window.innerWidth < 1024) {
        document.getElementById('sidebar').classList.remove('mobile-open');
    }

    document.getElementById('chat-header-name').innerText = user.name;
    const avatarHTML = user.profile_photo
        ? `<img src="${user.profile_photo}" class="w-full h-full object-cover rounded-xl" alt="Profile">`
        : user.name.charAt(0).toUpperCase();

    document.getElementById('chat-header-avatar').innerHTML = avatarHTML;
    document.getElementById('typing-indicator').classList.add('hidden');

    const lockBtn = document.getElementById('chat-lock-btn');
    if (state.lockedChats.includes(user.id)) {
        lockBtn.innerHTML = '<i class="fa-solid fa-lock text-red-400"></i>';
    } else {
        lockBtn.innerHTML = '<i class="fa-solid fa-lock-open text-slate-400"></i>';
    }

    renderUserList(state.users);
    fetchMessages();
    markAsRead(user.id);

    // On mobile, close sidebar after selecting a chat
    if (window.innerWidth < 1024) {
        toggleSidebar();
    }
}

async function markAsRead(otherUserId) {
    try {
        await fetch(`/api/messages/read/${otherUserId}`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${state.token}` }
        });
    } catch (e) { }
}

async function deleteMessageAPI(id) {
    if (!confirm('Delete this message for everyone?')) return;
    try {
        const res = await fetch(`/api/messages/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${state.token}` }
        });
        if (res.ok) {
            state.messages = state.messages.map(m => m.id === id ? { ...m, is_deleted: 1, message: "This message was deleted" } : m);
            renderMessages();
        }
    } catch (e) {
        showToast('Failed to delete message');
    }
}

// Message Functions
async function fetchMessages() {
    if (!state.activeChat) return;
    try {
        const res = await fetch(`/api/messages/${state.activeChat.id}`, {
            headers: { 'Authorization': `Bearer ${state.token}` }
        });
        const data = await res.json();
        if (res.ok) {
            const hasNew = data.length !== state.messages.length;
            state.messages = data;
            if (hasNew) {
                renderMessages();
                scrollToBottom();
            }
        }
    } catch (err) {
        console.error('Error fetching messages', err);
    }
}

function renderMessages() {
    messagesContainer.innerHTML = '';
    state.messages.forEach(msg => {
        const isMe = msg.sender_id === state.user.id;
        const div = document.createElement('div');
        div.className = `flex ${isMe ? 'justify-end' : 'justify-start'} group mb-4`;

        let attachmentHTML = '';
        if (msg.attachment_path && !msg.is_deleted) {
            if (msg.attachment_type && msg.attachment_type.startsWith('image/')) {
                attachmentHTML = `<img src="${msg.attachment_path}" class="max-w-xs md:max-w-sm rounded-2xl mb-2 cursor-pointer hover:opacity-90 transition-opacity border border-slate-700/50" onclick="window.open('${msg.attachment_path}')">`;
            } else if (msg.attachment_type && msg.attachment_type.startsWith('audio/')) {
                attachmentHTML = `
                    <div class="voice-note-container p-3 bg-slate-800/40 rounded-2xl mb-2 border border-slate-700/30 min-w-[240px]">
                        <div class="flex items-center gap-3">
                            <button class="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white" onclick="toggleAudio(this, '${msg.attachment_path}')">
                                <i class="fa-solid fa-play ml-0.5"></i>
                            </button>
                            <div class="flex-1 h-1 bg-slate-700 rounded-full overflow-hidden relative">
                                <div class="audio-progress absolute inset-y-0 left-0 bg-blue-400 w-0"></div>
                            </div>
                        </div>
                    </div>`;
            } else {
                attachmentHTML = `
                    <a href="${msg.attachment_path}" target="_blank" class="flex items-center gap-2 p-3 bg-slate-800/50 rounded-xl mb-2 hover:bg-slate-800 transition-all border border-slate-700/30">
                        <i class="fa-solid fa-file-lines text-xl text-blue-400"></i>
                        <div class="flex-1 overflow-hidden">
                            <p class="text-xs font-semibold truncate text-slate-100">${msg.attachment_name || 'Document'}</p>
                            <p class="text-[10px] text-slate-500 uppercase tracking-tighter">Click to download</p>
                        </div>
                    </a>`;
            }
        }

        const ticksHTML = isMe ? `
            <span class="ml-1 text-[10px] ${msg.is_read ? 'text-blue-400' : 'text-slate-400'}">
                <i class="fa-solid fa-check-double"></i>
            </span>
        ` : '';

        const deleteBtn = (isMe && !msg.is_deleted) ? `
            <button onclick="deleteMessageAPI(${msg.id})" class="opacity-0 group-hover:opacity-100 p-1 text-slate-500 hover:text-red-400 transition-all text-xs ml-2">
                <i class="fa-solid fa-trash-can"></i>
            </button>
        ` : '';

        div.innerHTML = `
            <div class="flex flex-col ${isMe ? 'items-end' : 'items-start'} max-w-[80%]">
                <div class="message-bubble ${isMe ? 'message-sent' : 'message-received'} ${msg.is_deleted ? 'italic opacity-60' : ''} relative">
                    ${attachmentHTML}
                    ${msg.message ? `<p class="text-[14px] leading-relaxed">${escapeHTML(msg.message)}</p>` : ''}
                    <div class="flex items-center justify-end mt-1 gap-1">
                        <span class="text-[9px] uppercase font-bold tracking-tighter ${isMe ? 'text-blue-200/60' : 'text-slate-500'}">${formatTime(msg.created_at)}</span>
                        ${ticksHTML}
                    </div>
                </div>
                ${deleteBtn}
            </div>
        `;
        messagesContainer.appendChild(div);
    });
}

function toggleAudio(btn, url) {
    let audio = btn._audio;
    const icon = btn.querySelector('i');
    const progress = btn.parentElement.querySelector('.audio-progress');

    if (!audio) {
        audio = new Audio(url);
        btn._audio = audio;
        audio.ontimeupdate = () => {
            const percent = (audio.currentTime / audio.duration) * 100;
            progress.style.width = percent + '%';
        };
        audio.onended = () => {
            icon.className = 'fa-solid fa-play ml-0.5';
        };
    }

    if (audio.paused) {
        audio.play();
        icon.className = 'fa-solid fa-pause';
    } else {
        audio.pause();
        icon.className = 'fa-solid fa-play ml-0.5';
    }
}

function scrollToBottom() {
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function formatTime(dateStr) {
    const date = new Date(dateStr);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function escapeHTML(str) {
    const p = document.createElement('p');
    p.textContent = str;
    return p.innerHTML;
}

async function sendMessage(file = null) {
    const text = messageInput.value.trim();
    if (!text && !file || !state.activeChat) return;

    if (state.socket) {
        state.socket.emit('stop_typing', { senderId: state.user.id, receiverId: state.activeChat.id });
    }

    const currentMsg = text;
    messageInput.value = '';
    messageInput.style.height = 'auto';

    const formData = new FormData();
    formData.append('receiver_id', state.activeChat.id);
    if (text) formData.append('message', text);
    if (file) formData.append('file', file);

    try {
        const res = await fetch('/api/messages/send', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${state.token}` },
            body: formData
        });

        if (res.ok) {
            const sentMsg = await res.json();
            state.messages.push(sentMsg);
            renderMessages();
            scrollToBottom();
            fetchChatList();
        } else {
            const data = await res.json();
            showToast(data.message || 'Failed to send message');
            messageInput.value = currentMsg;
        }
    } catch (err) {
        showToast('Server error');
        messageInput.value = currentMsg;
    }
}

// Event Listeners
const voiceBtn = document.getElementById('voice-btn');
if (voiceBtn) {
    voiceBtn.onclick = () => {
        if (!state.isRecording) {
            startRecording();
        } else {
            stopRecording();
        }
    };
}

sendBtn.addEventListener('click', () => sendMessage());
messageInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
});

let typingTimeout;
messageInput.addEventListener('input', () => {
    messageInput.style.height = 'auto';
    messageInput.style.height = (messageInput.scrollHeight) + 'px';

    if (state.activeChat && state.socket) {
        state.socket.emit('typing', { senderId: state.user.id, receiverId: state.activeChat.id });
        clearTimeout(typingTimeout);
        typingTimeout = setTimeout(() => {
            state.socket.emit('stop_typing', { senderId: state.user.id, receiverId: state.activeChat.id });
        }, 2000);
    }
});

userSearchInput.addEventListener('input', (e) => {
    state.searchQuery = e.target.value;
    clearTimeout(state.searchTimeout);
    state.searchTimeout = setTimeout(() => searchUsers(state.searchQuery), 300);
});

const attachBtn = document.getElementById('attach-btn');
if (attachBtn) {
    attachBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleAttachMenu();
    });
}

document.addEventListener('click', (e) => {
    const menu = document.getElementById('attach-menu');
    const emojiPicker = document.getElementById('emoji-picker');

    if (menu && !menu.classList.contains('hidden') && !e.target.closest('#attach-btn')) {
        menu.classList.add('hidden');
    }

    if (emojiPicker && !emojiPicker.classList.contains('hidden') && !e.target.closest('#emoji-picker') && !e.target.closest('button[onclick="toggleEmojiPicker()"]')) {
        emojiPicker.classList.add('hidden');
    }
});

const fileInput = document.getElementById('file-input');
if (fileInput) {
    fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            sendMessage(file);
            fileInput.value = '';
        }
    });
}

// Custom enter behavior for OTP input
document.getElementById('auth-otp').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') verifyOTP();
});

document.getElementById('auth-phone').addEventListener('input', (e) => {
    e.target.value = e.target.value.replace(/\D/g, '');
});

document.getElementById('auth-phone').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') sendOTP();
});

document.getElementById('lock-passcode').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') submitPasscode();
});
document.getElementById('lock-submit-btn').addEventListener('click', () => submitPasscode());

// --- Profile & Lock Features ---

async function uploadProfilePhoto(input) {
    if (!input.files || !input.files[0]) return;
    const formData = new FormData();
    formData.append('photo', input.files[0]);

    try {
        const res = await fetch('/api/users/profile-photo', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${state.token}` },
            body: formData
        });
        if (res.ok) {
            const data = await res.json();
            state.user.profile_photo = data.profile_photo;
            updateCurrentUserUI();
            showToast('Profile photo updated!', 'success');
        } else {
            showToast('Failed to update photo');
        }
    } catch (e) {
        showToast('Error uploading photo');
    }
}

async function fetchLockedChats() {
    try {
        const res = await fetch('/api/users/locked-chats', {
            headers: { 'Authorization': `Bearer ${state.token}` }
        });
        if (res.ok) {
            state.lockedChats = await res.json();
        }
    } catch (e) { }
}

async function toggleChatLock() {
    if (!state.activeChat) return;

    const isLocked = state.lockedChats.includes(state.activeChat.id);
    if (isLocked) {
        // Unlock logic
        const passcode = prompt("Enter passcode to unlock this chat completely:");
        if (!passcode) return;

        try {
            const res = await fetch('/api/users/unlock-chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${state.token}` },
                body: JSON.stringify({ locked_chat_id: state.activeChat.id, passcode })
            });

            if (res.ok) {
                state.lockedChats = state.lockedChats.filter(id => id !== state.activeChat.id);
                document.getElementById('chat-lock-btn').innerHTML = '<i class="fa-solid fa-lock-open text-slate-400"></i>';
                renderUserList(state.users);
                showToast('Chat unlocked successfully!', 'success');
            } else {
                const data = await res.json();
                showToast(data.message || 'Unlock failed');
            }
        } catch (e) {
            showToast('Error unlocking chat');
        }
    } else {
        // Lock logic
        const passcode = prompt("Set a 4-digit passcode for this chat:");
        if (!passcode || passcode.length < 4) {
            showToast('Passcode must be at least 4 characters');
            return;
        }

        try {
            const res = await fetch('/api/users/lock-chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${state.token}` },
                body: JSON.stringify({ locked_chat_id: state.activeChat.id, passcode })
            });

            if (res.ok) {
                state.lockedChats.push(state.activeChat.id);
                document.getElementById('chat-lock-btn').innerHTML = '<i class="fa-solid fa-lock text-red-400"></i>';
                renderUserList(state.users);
                showToast('Chat locked successfully!', 'success');
            } else {
                showToast('Lock failed');
            }
        } catch (e) {
            showToast('Error locking chat');
        }
    }
}

function showLockModal(user) {
    state.pendingLockUser = user;
    document.getElementById('lock-passcode').value = '';
    document.getElementById('lock-modal').classList.remove('hidden');
    setTimeout(() => document.getElementById('lock-passcode').focus(), 100);
}

function closeLockModal() {
    state.pendingLockUser = null;
    document.getElementById('lock-modal').classList.add('hidden');
}

async function submitPasscode() {
    if (!state.pendingLockUser) return;
    const passcode = document.getElementById('lock-passcode').value;
    if (!passcode) return;

    try {
        const res = await fetch('/api/users/verify-lock', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${state.token}` },
            body: JSON.stringify({ locked_chat_id: state.pendingLockUser.id, passcode })
        });

        if (res.ok) {
            const data = await res.json();
            if (data.verified) {
                const user = state.pendingLockUser;
                closeLockModal();
                proceedSelectChat(user); // Grant temporary access without removing lock
            } else {
                showToast('Incorrect passcode');
            }
        } else {
            showToast('Verification failed');
        }
    } catch (e) {
        showToast('Error verifying passcode');
    }
}

init();
