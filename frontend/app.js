const API_URL = "http://localhost:8000";
let token = localStorage.getItem("token");
let currentUser = localStorage.getItem("username");

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

    if (!username || !password) {
        alert("Podaj login i hasło");
        return;
    }

    console.log(`Loguję jako ${username}`);

    currentUser = username;
    token = "fake-token";
    localStorage.setItem("token", token);
    localStorage.setItem("username", currentUser);

    alert("Zalogowano");
    showDashboard();
}

async function register() {
    const username = document.getElementById('reg-username').value;
    const password = document.getElementById('reg-password').value;

    if (!username || !password) {
        alert("Podaj login i hasło");
        return;
    }

    try {
        const response = await fetch(`${API_URL}/users/`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        if (!response.ok) {
            const errData = await response.json();
            throw new Error(errData.detail || "Rejestracja nie powiodła się");
        }
        alert("Zarejestrowano pomyślnie! Możesz się teraz zalogować.");
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
}
