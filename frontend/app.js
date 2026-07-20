const API_URL = "";
let token = localStorage.getItem("token");
let currentUser = localStorage.getItem("username");
let ws = null;

document.addEventListener("DOMContentLoaded", () => {
    if (token) {
        showDashboard();
    } else {
        showAuth();
    }
});

function toggleAuth(view) {
    if (view === 'register') {
        document.getElementById('login-form').classList.add('hidden');
        document.getElementById('register-form').classList.remove('hidden');
    } else {
        document.getElementById('register-form').classList.add('hidden');
        document.getElementById('login-form').classList.remove('hidden');
    }
}

// Logowanie przez REST API (wysyła POST /token)
async function login() {
    const username = document.getElementById('login-username').value;
    const password = document.getElementById('login-password').value;

    const formData = new FormData();
    formData.append('username', username);
    formData.append('password', password);

    try {
        const response = await fetch(`${API_URL}/token`, {
            method: 'POST',
            body: formData
        });
        if (!response.ok) throw new Error("Login failed");

        const data = await response.json();
        token = data.access_token;
        currentUser = username;
        localStorage.setItem("token", token);
        localStorage.setItem("username", currentUser);
        showDashboard();
    } catch (e) {
        alert(e.message);
    }
}

async function register() {
    const username = document.getElementById('reg-username').value;
    const password = document.getElementById('reg-password').value;

    try {
        const response = await fetch(`${API_URL}/users/`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        if (!response.ok) {
            const errData = await response.json();
            throw new Error(errData.detail || "Registration failed");
        }
        alert("Registered successfully! Please login.");
        toggleAuth('login');
    } catch (e) {
        console.error(e);
        alert(e.message);
    }
}

async function logout() {
    try {
        await fetch(`${API_URL}/logout`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` }
        });
    } catch (e) {
        console.log("Logout request failed, continuing with local cleanup");
    }

    localStorage.removeItem("token");
    localStorage.removeItem("username");
    token = null;
    currentUser = null;
    if (ws) ws.close();
    showAuth();
}

function showAuth() {
    document.getElementById('auth-view').classList.remove('hidden');
    document.getElementById('dashboard-view').classList.add('hidden');
}

function showDashboard() {
    document.getElementById('auth-view').classList.add('hidden');
    document.getElementById('dashboard-view').classList.remove('hidden');
    document.getElementById('welcome-msg').innerText = `Witaj, ${currentUser}`;

    loadUsers();
    loadExpenses();
    loadChatHistory();
    initWebSocket();
}

async function loadChatHistory() {
    try {
        const response = await fetch(`${API_URL}/chat/history`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (response.status === 401) {
            logout();
            return;
        }
        if (response.ok) {
            const messages = await response.json();
            const container = document.getElementById('chat-messages');
            container.innerHTML = '';
            messages.forEach(msg => {
                const time = new Date(msg.timestamp).toLocaleTimeString();
                const username = msg.user ? msg.user.username : 'Unknown';
                addChatMessage(username, msg.content, time, msg.id);
            });
        }
    } catch (e) {
        console.error("Failed to load chat history", e);
    }
}

// Pobieranie danych przez REST API (GET /expenses)
async function loadExpenses(search = "") {
    let url = `${API_URL}/expenses/`;
    if (search) url += `?search=${search}`;

    const response = await fetch(url, {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    if (response.status === 401) {
        logout();
        return;
    }
    const expenses = await response.json();
    renderExpenses(expenses);
    calculateDebt(expenses);
}

function renderExpenses(expenses) {
    const list = document.getElementById('expense-list');
    list.innerHTML = '';

    expenses.forEach(exp => {
        const div = document.createElement('div');
        div.className = 'expense-item';
        
        let sharesList = '';
        if (exp.shares && exp.shares.length > 0) {
            const sharesStr = exp.shares.map(share => {
                const debtorName = share.debtor ? share.debtor.username : 'Unknown';
                return `<strong>${debtorName}</strong> (${share.amount_owed.toFixed(2)} PLN)`;
            }).join(', ');
            sharesList = `<br><span class="expense-shares" style="font-size: 0.8em; color: #555; background: #f1f5f9; padding: 2px 8px; border-radius: 4px; display: inline-block; margin-top: 5px; border: 1px solid #e2e8f0;">Długi: ${sharesStr}</span>`;
        }

        div.innerHTML = `
            <div class="expense-details">
                <strong>${exp.description}</strong> - ${exp.amount} PLN <br>
                <small>Paid by: ${exp.payer ? exp.payer.username : 'Unknown'} | Date: ${new Date(exp.timestamp).toLocaleString()}</small>
                ${sharesList}
            </div>
            <div class="expense-actions">
                ${exp.payer && exp.payer.username === currentUser ? `<button onclick="deleteExpense(${exp.id})">Delete</button>` : ''}
            </div>
        `;
        list.appendChild(div);
    });
}

async function addExpense() {
    const amount = parseFloat(document.getElementById('exp-amount').value);
    const description = document.getElementById('exp-desc').value;

    const checkboxes = document.querySelectorAll('input[name="split-user"]:checked');
    const selectedUserIds = Array.from(checkboxes).map(cb => parseInt(cb.value));

    if (!amount || !description) return alert("Wypełnij wszystkie pola");
    if (selectedUserIds.length === 0) return alert("Wybierz przynajmniej jedną osobę do podziału");

    const excludePayer = document.getElementById('exclude-payer').checked;
    const totalPeople = excludePayer ? selectedUserIds.length : selectedUserIds.length + 1;
    const splitAmount = amount / totalPeople;

    const shares = selectedUserIds.map(uid => ({
        debtor_id: uid,
        amount_owed: splitAmount
    }));

    try {
        const response = await fetch(`${API_URL}/expenses/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                amount,
                description,
                shares
            })
        });
        if (!response.ok) throw new Error("Failed to add expense");

        document.getElementById('exp-amount').value = '';
        document.getElementById('exp-desc').value = '';
        document.getElementById('exclude-payer').checked = false;
        // Uncheck all selected user checkboxes
        checkboxes.forEach(cb => cb.checked = false);
    } catch (e) {
        alert(e.message);
    }
}

async function deleteExpense(id) {
    if (!confirm("Delete?")) return;
    await fetch(`${API_URL}/expenses/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
    });
}

function calculateDebt(expenses) {
    // Słownik bilansów z poszczególnymi osobami (dodatni: wiszą mi, ujemny: ja wiszę im)
    const balances = {};

    expenses.forEach(exp => {
        const payerName = exp.payer ? exp.payer.username : 'Unknown';
        
        if (payerName === currentUser) {
            // Ja płaciłem, inni wiszą mi
            exp.shares.forEach(share => {
                const debtorName = share.debtor ? share.debtor.username : 'Unknown';
                if (debtorName !== currentUser) {
                    balances[debtorName] = (balances[debtorName] || 0) + share.amount_owed;
                }
            });
        } else {
            // Ktoś inny płacił, patrzę czy ja mu wiszę
            exp.shares.forEach(share => {
                const debtorName = share.debtor ? share.debtor.username : 'Unknown';
                if (debtorName === currentUser) {
                    balances[payerName] = (balances[payerName] || 0) - share.amount_owed;
                }
            });
        }
    });

    const container = document.getElementById('debt-summary');
    
    let toReceiveHTML = '';
    let toPayHTML = '';
    let totalOwedToMe = 0;
    let totalIOwe = 0;

    // Sortujemy alfabetycznie po nazwach użytkowników
    const sortedUsers = Object.keys(balances).sort();

    sortedUsers.forEach(user => {
        const balance = balances[user];
        if (balance > 0.01) {
            toReceiveHTML += `<li style="margin: 4px 0;"><strong>${user}</strong> powinien Ci przelać: <span style="color: #2ecc71; font-weight: bold;">+${balance.toFixed(2)} PLN</span></li>`;
            totalOwedToMe += balance;
        } else if (balance < -0.01) {
            const absoluteBalance = Math.abs(balance);
            toPayHTML += `<li style="margin: 4px 0;">Musisz przelać użytkownikowi <strong>${user}</strong>: <span style="color: #e74c3c; font-weight: bold;">-${absoluteBalance.toFixed(2)} PLN</span></li>`;
            totalIOwe += absoluteBalance;
        }
    });

    const net = totalOwedToMe - totalIOwe;

    let html = '';
    if (toReceiveHTML) {
        html += `<p style="margin-bottom: 5px; font-weight: bold; color: #2c3e50;">Otrzymasz od innych:</p><ul style="margin-top: 0; padding-left: 20px;">${toReceiveHTML}</ul>`;
    }
    if (toPayHTML) {
        html += `<p style="margin-bottom: 5px; font-weight: bold; color: #2c3e50;">Powinieneś uregulować (np. BLIK):</p><ul style="margin-top: 0; padding-left: 20px;">${toPayHTML}</ul>`;
    }
    if (!toReceiveHTML && !toPayHTML) {
        html += `<p style="color: #7f8c8d; font-style: italic;">Jesteś rozliczony na czysto ze wszystkimi!</p>`;
    }

    html += `<hr style="border: 0; border-top: 1px solid #eee; margin: 15px 0;"><p>Twój ogólny bilans: <strong style="color: ${net >= 0 ? '#2ecc71' : '#e74c3c'}">${net.toFixed(2)} PLN</strong></p>`;

    container.innerHTML = html;
}

let searchTimeout;
function debounceSearch() {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
        const query = document.getElementById('search-input').value;
        loadExpenses(query);
    }, 500);
}

// Połączenie z WebSocket dla czatu w czasie rzeczywistym
function initWebSocket() {
    if (ws) ws.close();
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(`${wsProtocol}//${window.location.host}/ws`);

    // Odbieranie wiadomości WebSocket (event listener)
    ws.onmessage = (event) => {
        const data = JSON.parse(event.data);

        if (data.event === 'chat') {
            addChatMessage(data.user, data.msg, data.time, data.message_id);
        } else if (data.event === 'delete_message') {
            const msgEl = document.querySelector(`[data-message-id="${data.message_id}"]`);
            if (msgEl) msgEl.remove();
        } else if (data.event === 'update_message') {
            const msgEl = document.querySelector(`[data-message-id="${data.message_id}"]`);
            if (msgEl) {
                const contentEl = msgEl.querySelector('.msg-content');
                if (contentEl) contentEl.textContent = data.content;
            }
        } else {
            showNotification(`Zdarzenie: ${data.event}`);
            loadExpenses(document.getElementById('search-input').value);
        }
    };
}

function sendChat() {
    const input = document.getElementById('chat-input');
    const msg = input.value;
    if (!msg) return;

    const payload = {
        event: 'chat',
        user: currentUser,
        msg: msg,
        time: new Date().toLocaleTimeString()
    };

    ws.send(JSON.stringify(payload));
    input.value = '';
}

function addChatMessage(user, msg, time, messageId = null) {
    const div = document.createElement('div');
    div.className = 'message';
    if (messageId) div.dataset.messageId = messageId;

    const actionBtns = (user === currentUser && messageId)
        ? `<button onclick="editMessage(${messageId})" class="edit-msg-btn">✏️</button><button onclick="deleteMessage(${messageId})" class="delete-msg-btn">×</button>`
        : '';

    div.innerHTML = `
        <span class="meta">[${time}] <strong>${user}</strong>:</span>
        <span class="msg-content">${msg}</span>
        ${actionBtns}
    `;
    const container = document.getElementById('chat-messages');
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
}

async function editMessage(messageId) {
    const msgEl = document.querySelector(`[data-message-id="${messageId}"]`);
    const currentContent = msgEl.querySelector('.msg-content').textContent;
    const newContent = prompt('Edytuj wiadomość:', currentContent);

    if (!newContent || newContent === currentContent) return;

    try {
        const response = await fetch(`${API_URL}/messages/${messageId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ content: newContent })
        });
        if (!response.ok) throw new Error('Failed to edit message');
    } catch (e) {
        alert(e.message);
    }
}

async function deleteMessage(messageId) {
    try {
        const response = await fetch(`${API_URL}/messages/${messageId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!response.ok) throw new Error('Failed to delete message');
    } catch (e) {
        alert(e.message);
    }
}

function toggleChatBody() {
    const body = document.getElementById('chat-body');
    const icon = document.getElementById('chat-toggle-icon');
    if (body.style.display === 'none') {
        body.style.display = 'block';
        if (icon) icon.textContent = '▼';
    } else {
        body.style.display = 'none';
        if (icon) icon.textContent = '▲';
    }
}

function showNotification(msg) {
    const area = document.getElementById('notification-area');
    const note = document.createElement('div');
    note.className = 'notification';
    note.innerText = msg;
    area.appendChild(note);
    setTimeout(() => note.remove(), 3000);
}

async function changePasswordPrompt() {
    const oldPass = prompt("Podaj stare hasło:");
    if (!oldPass) return;

    const newPass = prompt("Podaj nowe hasło:");
    if (!newPass) return;

    try {
        const response = await fetch(`${API_URL}/users/me/password`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                old_password: oldPass,
                new_password: newPass
            })
        });

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.detail || "Nie udało się zmienić hasła");
        }

        alert("Hasło zostało zmienione.");
    } catch (e) {
        alert(e.message);
    }
}

async function deleteAccount() {
    if (!confirm("Czy na pewno chcesz usunąć swoje konto? Tej operacji nie można cofnąć!")) return;

    try {
        const response = await fetch(`${API_URL}/users/me`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const me = await response.json();

        const delResp = await fetch(`${API_URL}/users/${me.id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!delResp.ok) throw new Error("Nie udało się usunąć konta");

        alert("Konto usunięte.");
        logout();
    } catch (e) {
        alert(e.message);
    }
}

async function loadUsers() {
    const response = await fetch(`${API_URL}/users/`, {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    if (response.status === 401) {
        logout();
        return;
    }
    const users = await response.json();
    const container = document.getElementById('user-select-list');
    container.innerHTML = '';

    users.forEach(user => {
        if (user.username === currentUser) return;

        const div = document.createElement('div');
        div.className = 'user-select-item';
        div.onclick = (e) => {
            if (e.target.tagName !== 'INPUT') {
                const cb = div.querySelector('input');
                cb.checked = !cb.checked;
            }
        };

        div.innerHTML = `
            <input type="checkbox" name="split-user" value="${user.id}" id="user-${user.id}">
            <label for="user-${user.id}">${user.username}</label>
        `;
        container.appendChild(div);
    });
}
