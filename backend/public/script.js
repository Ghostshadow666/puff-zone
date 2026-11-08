// Fichier de secours - Fonctions de base uniquement
function showLoginForm() {
    const modal = document.getElementById('login-modal');
    if (modal) modal.style.display = 'flex';
}
function hideLoginForm() {
    const modal = document.getElementById('login-modal');
    if (modal) modal.style.display = 'none';
}
function showRegisterForm() {
    const login = document.getElementById('login-form');
    const reg = document.getElementById('register-form');
    if (login) login.style.display = 'none';
    if (reg) reg.style.display = 'block';
}