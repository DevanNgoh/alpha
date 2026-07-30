const scriptURL = "https://script.google.com/macros/s/AKfycbxENWyvJtzuqPeMfAXStAMzk9pYB9qS2HZS_q3gCglp50ddf06ssy1cdkGPqNSaycSL/exec";

const form = document.getElementById("attendanceForm");
const button = document.getElementById("submitBtn");
const message = document.getElementById("message");
const greeting = document.getElementById("greeting");

// Greeting
const hour = new Date().getHours();

if(hour < 12){
    greeting.innerHTML = "🌅 Good Morning!";
} else if(hour < 18){
    greeting.innerHTML = "☀️ Good Afternoon!";
} else {
    greeting.innerHTML = "🌙 Good Evening!";
}

// Pre-fill church name if previously saved
window.onload = () => {
    document.getElementById("church").value = localStorage.getItem("church") || "";
};

// =======================================
// CONFETTI CELEBRATION
// =======================================

function launchConfetti() {
    const container = document.getElementById("confetti-container");
    if (!container) return;

    const colors = ["#0B3D2E", "#1fa25d", "#eab308", "#ffffff", "#145A44"];
    const pieces = 60;

    for (let i = 0; i < pieces; i++) {
        const el = document.createElement("div");
        el.className = "confetti-piece";
        el.style.left = Math.random() * 100 + "vw";
        el.style.background = colors[Math.floor(Math.random() * colors.length)];
        el.style.animationDuration = 2 + Math.random() * 1.5 + "s";
        el.style.animationDelay = Math.random() * 0.3 + "s";
        el.style.transform = `rotate(${Math.random() * 360}deg)`;
        container.appendChild(el);

        setTimeout(() => el.remove(), 4000);
    }
}

// Reset the form view so another person can check in
function resetFormForNextPerson() {
    form.style.display = "block";
    message.innerHTML = "";
    document.getElementById("name").value = "";
    button.disabled = false;
    button.innerHTML = "Record Attendance";
    document.getElementById("name").focus();
}

form.addEventListener("submit", (e) => {

    e.preventDefault();

    const nameInput = document.getElementById("name");
    const churchInput = document.getElementById("church");

    const name = nameInput.value.trim();
    const church = churchInput.value.trim();

    if (!name) {
        message.innerHTML = "Please enter your name.";
        return;
    }

    button.disabled = true;
    button.innerHTML = "Submitting...";

    fetch(scriptURL, {

        method: "POST",

        headers: {
            "Content-Type": "text/plain;charset=utf-8"
        },

        body: JSON.stringify({
            name: name,
            church: church
        })

    })

    .then(r => r.json())

    .then(() => {

        if (church) {
            localStorage.setItem("church", church);
        }

        form.style.display = "none";

        message.innerHTML = `
        <div style="font-size:65px;">✅</div>

        <h2>Attendance Recorded</h2>

        <p>
        Thank you, <strong>${name}</strong>!
        <br><br>
        Have a blessed fellowship today.
        </p>

        <button type="button" onclick="resetFormForNextPerson()" style="margin-top:20px; padding:12px 20px; background:#0B3D2E; color:white; border:none; border-radius:10px; cursor:pointer; font-weight:600;">
            ➕ Check In Another Person
        </button>
        `;

        launchConfetti();

    })

    .catch((err) => {

        console.error("Submission error:", err);

        button.disabled = false;

        button.innerHTML = "Record Attendance";

        message.innerHTML = "Something went wrong. Please check your connection and try again.";

    });

});