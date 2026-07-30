// =======================================
// ADMIN LOGIN
// =======================================
// NOTE: This is a front-end only site with no server, so any password
// check happens in the browser. Storing a SHA-256 hash (instead of the
// plain word "Pastor123") means the password itself is not sitting in
// plain text in the page source, but a determined person with dev tools
// could still brute-force it offline. For real security, this password
// should be checked by a small server / Apps Script endpoint instead.

const ADMIN_PASSWORD_HASH =
    "2b0cfbb079544e46edc7d0ffde2330bd0f8b35d5f4721f384a25fc1a992cdfc4";

const loginButton = document.getElementById("loginBtn");
const passwordInput = document.getElementById("password");
const error = document.getElementById("error");
const togglePassword = document.getElementById("togglePassword");

const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 60000; // 1 minute

async function sha256(text) {
    const data = new TextEncoder().encode(text);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(hashBuffer))
        .map(b => b.toString(16).padStart(2, "0"))
        .join("");
}

function getLockoutUntil() {
    return parseInt(localStorage.getItem("loginLockoutUntil") || "0", 10);
}

function getAttempts() {
    return parseInt(localStorage.getItem("loginAttempts") || "0", 10);
}

function checkLockout() {
    const lockoutUntil = getLockoutUntil();
    if (lockoutUntil > Date.now()) {
        const secondsLeft = Math.ceil((lockoutUntil - Date.now()) / 1000);
        error.textContent = `Too many attempts. Try again in ${secondsLeft}s.`;
        loginButton.disabled = true;
        setTimeout(checkLockout, 1000);
        return true;
    }
    loginButton.disabled = false;
    return false;
}

async function login() {

    if (checkLockout()) return;

    const password = passwordInput.value.trim();

    if (!password) {
        error.textContent = "Please enter a password.";
        return;
    }

    loginButton.disabled = true;
    loginButton.textContent = "Checking...";

    const hashed = await sha256(password);

    if (hashed === ADMIN_PASSWORD_HASH) {

        localStorage.removeItem("loginAttempts");
        localStorage.removeItem("loginLockoutUntil");

        sessionStorage.setItem("loggedIn", "true");

        window.location.href = "admin.html";

    } else {

        const attempts = getAttempts() + 1;
        localStorage.setItem("loginAttempts", attempts.toString());

        if (attempts >= MAX_ATTEMPTS) {
            localStorage.setItem("loginLockoutUntil", (Date.now() + LOCKOUT_MS).toString());
            localStorage.setItem("loginAttempts", "0");
            checkLockout();
        } else {
            error.textContent = `Incorrect password. ${MAX_ATTEMPTS - attempts} attempt(s) left.`;
            loginButton.disabled = false;
            loginButton.textContent = "Login";
        }

        passwordInput.value = "";
        passwordInput.focus();
    }
}

loginButton.addEventListener("click", login);

passwordInput.addEventListener("keypress", function (event) {
    if (event.key === "Enter") {
        login();
    }
});

if (togglePassword) {
    togglePassword.addEventListener("click", () => {
        const isPassword = passwordInput.type === "password";
        passwordInput.type = isPassword ? "text" : "password";
        togglePassword.textContent = isPassword ? "🙈" : "👁";
    });
}

checkLockout();
