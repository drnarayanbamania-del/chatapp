// State Management
let state = {
    user: null,
    token: localStorage.getItem('token'),
    activeChat: null,
    users: [],
    messages: [],
    searchQuery: '',
    pollInterval: null,
    tempPhone: ''
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
            fetchChatList();
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
    showToast('Login successful!', 'success');
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
    clearInterval(state.pollInterval);
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
        document.getElementById('current-user-avatar').innerText = state.user.name.charAt(0).toUpperCase();

        // Update Profile Drawer
        document.getElementById('profile-name').innerText = state.user.name;
        document.getElementById('profile-username').innerText = `@${state.user.username}`;
        document.getElementById('profile-email').innerText = state.user.email || 'No email set';
        document.getElementById('profile-date').innerText = new Date(state.user.created_at).toLocaleDateString([], { month: 'long', year: 'numeric' });
        document.getElementById('profile-avatar').innerText = state.user.name.charAt(0).toUpperCase();
    }
}

function toggleProfile() {
    const sidebar = document.getElementById('profile-sidebar');
    sidebar.classList.toggle('translate-x-full');
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

        const lastMsg = u.last_message ? u.last_message : 'No messages yet';
        const time = u.last_message_time ? formatRelativeTime(u.last_message_time) : '';

        div.innerHTML = `
            <div class="relative">
                <div class="w-12 h-12 rounded-2xl bg-gradient-to-br from-slate-700 to-slate-800 flex items-center justify-center text-white font-bold text-lg shadow-inner">
                    ${u.name.charAt(0).toUpperCase()}
                </div>
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
    state.activeChat = user;
    welcomeWindow.classList.add('hidden');
    activeChatWindow.classList.remove('hidden');

    if (window.innerWidth < 1024) {
        document.getElementById('sidebar').classList.remove('mobile-open');
    }

    document.getElementById('chat-header-name').innerText = user.name;
    document.getElementById('chat-header-avatar').innerText = user.name.charAt(0).toUpperCase();

    renderUserList(state.users);
    fetchMessages();

    if (state.pollInterval) clearInterval(state.pollInterval);
    state.pollInterval = setInterval(fetchMessages, 3000);
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
        div.className = `flex ${isMe ? 'justify-end' : 'justify-start'}`;

        let attachmentHTML = '';
        if (msg.attachment_path) {
            if (msg.attachment_type && msg.attachment_type.startsWith('image/')) {
                attachmentHTML = `<img src="${msg.attachment_path}" class="max-w-full rounded-lg mb-2 cursor-pointer hover:opacity-90 transition-opacity" onclick="window.open('${msg.attachment_path}')">`;
            } else {
                attachmentHTML = `
                    <a href="${msg.attachment_path}" target="_blank" class="flex items-center gap-2 p-3 bg-slate-800/50 rounded-xl mb-2 hover:bg-slate-800 transition-all border border-slate-700/30">
                        <i class="fa-solid fa-file-lines text-xl text-blue-400"></i>
                        <div class="flex-1 overflow-hidden">
                            <p class="text-xs font-semibold truncate">${msg.attachment_name || 'Document'}</p>
                            <p class="text-[10px] text-slate-500">Click to open</p>
                        </div>
                    </a>`;
            }
        }

        div.innerHTML = `
            <div class="message-bubble ${isMe ? 'message-sent' : 'message-received'} shadow-sm">
                ${attachmentHTML}
                ${msg.message ? `<p class="text-sm leading-relaxed">${escapeHTML(msg.message)}</p>` : ''}
                <span class="message-time ${isMe ? 'text-blue-100' : 'text-slate-500'}">${formatTime(msg.created_at)}</span>
            </div>
        `;
        messagesContainer.appendChild(div);
    });
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
            fetchMessages();
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
sendBtn.addEventListener('click', () => sendMessage());
messageInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
});

messageInput.addEventListener('input', () => {
    messageInput.style.height = 'auto';
    messageInput.style.height = (messageInput.scrollHeight) + 'px';
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
    if (menu && !menu.classList.contains('hidden') && !e.target.closest('#attach-btn')) {
        menu.classList.add('hidden');
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

init();
