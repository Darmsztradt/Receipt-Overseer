const API_URL = "http://localhost:8000";
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

function logout() {
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
    document.getElementById('welcome-msg').innerText = `Welcome, ${currentUser}`;

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
        if (response.ok) {
            const messages = await response.json();
            const container = document.getElementById('chat-messages');
            container.innerHTML = '';
            messages.forEach(msg => {
                const time = new Date(msg.timestamp).toLocaleTimeString();
                addChatMessage(msg.user ? msg.user.username : 'Unknown', msg.content, time);
            });
        }
    } catch (e) {
        console.error("Failed to load chat history", e);
    }
}



async function loadExpenses(search = "") {
    let url = `${API_URL}/expenses/`;
    if (search) url += `?search=${search}`;

    const response = await fetch(url, {
        headers: { 'Authorization': `Bearer ${token}` }
    });
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
        div.innerHTML = `
            <div class="expense-details">
                <strong>${exp.description}</strong> - $${exp.amount} <br>
                <small>Paid by: ${exp.payer ? exp.payer.username : 'Unknown'} | Date: ${new Date(exp.timestamp).toLocaleString()}</small>
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

    if (!amount || !description) return alert("Fill all fields");

    // Split logic: Equal split including payer
    // Total people = selected + payer (1)
    // Amount per person = amount / (selected.length + 1)

    const totalPeople = selectedUserIds.length + 1;
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
        // Checkboxes clear?
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
    let iOwe = 0;
    let owedToMe = 0;

    expenses.forEach(exp => {
        // If I paid
        if (exp.payer && exp.payer.username === currentUser) {
            exp.shares.forEach(share => {
                // If the share is for someone else, they owe me
                if (share.debtor && share.debtor.username !== currentUser) {
                    owedToMe += share.amount_owed;
                }
            });
        }
        // If someone else paid
        else if (exp.payer && exp.payer.username !== currentUser) {
            exp.shares.forEach(share => {
                // If I am the debtor, I owe them
                if (share.debtor && share.debtor.username === currentUser) {
                    iOwe += share.amount_owed;
                }
            });
        }
    });

    const net = owedToMe - iOwe;
    const container = document.getElementById('debt-summary');

    let html = `<p>Jesteś winien innym: <strong>${iOwe.toFixed(2)} PLN</strong></p>`;
    html += `<p>Inni są winni Tobie: <strong>${owedToMe.toFixed(2)} PLN</strong></p>`;
    html += `<hr><p>Bilans: <strong style="color: ${net >= 0 ? 'green' : 'red'}">${net.toFixed(2)} PLN</strong></p>`;

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

function initWebSocket() {
    if (ws) ws.close();
    ws = new WebSocket(`ws://localhost:8000/ws`);

    ws.onmessage = (event) => {
        const data = JSON.parse(event.data);

        if (data.event === 'chat') {
            addChatMessage(data.user, data.msg, data.time);
        } else {
            showNotification(`Zdarzenie: ${data.event}`);
            // simplistic reload
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

function addChatMessage(user, msg, time) {
    const div = document.createElement('div');
    div.className = 'message';
    div.innerHTML = `
        <span class="meta">[${time}] <strong>${user}</strong>:</span>
        <span>${msg}</span>
    `;
    const container = document.getElementById('chat-messages');
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
}

function toggleChatBody() {
    const body = document.getElementById('chat-body');
    if (body.style.display === 'none') {
        body.style.display = 'block';
    } else {
        body.style.display = 'none';
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

    // Need user ID. Checking token payload or fetching /users/me would be best.
    // For now we loop users to find self (inefficient but works with current `loadUsers` data if cached, but let's just fetch list)

    // Better: let's decode simple JWT if possible or just use what we have. 
    // We stored 'username'. 
    // Let's find ID from the user list we loaded?
    // Or add an endpoint /users/me. 
    // Quick hack for this task: iterate loaded users global or fetch again.

    try {
        const response = await fetch(`${API_URL}/users/`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const users = await response.json();
        const me = users.find(u => u.username === currentUser);

        if (!me) throw new Error("Nie znaleziono użytkownika");

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

// Update loadUsers for better UI
async function loadUsers() {
    const response = await fetch(`${API_URL}/users/`, {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    const users = await response.json();
    const container = document.getElementById('user-select-list');
    container.innerHTML = '';

    users.forEach(user => {
        if (user.username === currentUser) return;

        const div = document.createElement('div');
        div.className = 'user-select-item'; // Use new class
        // Make whole div clickable for checkbox
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
