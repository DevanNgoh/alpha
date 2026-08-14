const scriptURL = "https://script.google.com/macros/s/AKfycbyPGePG5S-ViJtUtKf04B0QZ87wRZVUUAwV76JvgqzZqKYr91ji7WY4AoommySCUiYV/exec";

const form = document.getElementById("attendanceForm");
const button = document.getElementById("submitBtn");
const message = document.getElementById("message");
const greeting = document.getElementById("greeting");

// Greeting based on time of day
const hour = new Date().getHours();
if (hour < 12) {
    greeting.innerHTML = "🌅 Good Morning!";
} else if (hour < 18) {
    greeting.innerHTML = "☀️ Good Afternoon!";
} else {
    greeting.innerHTML = "🌙 Good Evening!";
}

// Pre-fill church & country if previously saved
window.onload = () => {
    document.getElementById("church").value = localStorage.getItem("church") || "";
    document.getElementById("country").value = localStorage.getItem("country") || "";
};

function getLocalDateString(d = new Date()) {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function normalizeName(str) {
    return (str || "").trim().toLowerCase().replace(/\s+/g, ' ');
}

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

function resetFormForNextPerson() {
    form.style.display = "block";
    message.innerHTML = "";
    document.getElementById("name").value = "";
    button.disabled = false;
    button.innerHTML = "Record Attendance";
    document.getElementById("name").focus();
}

form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const nameInput = document.getElementById("name");
    const churchInput = document.getElementById("church");
    const countryInput = document.getElementById("country");

    const name = nameInput.value.trim();
    const church = churchInput.value.trim();
    const country = countryInput.value.trim();

    if (!name) {
        message.innerHTML = "<span style='color:red;'>Please enter your full name.</span>";
        return;
    }

    button.disabled = true;
    button.innerHTML = "Checking status...";
    message.innerHTML = "";

    try {
        // 1. Fetch current attendance list to check for existing entries
        const res = await fetch(scriptURL);
        const rawData = await res.json();
        const data = Array.isArray(rawData) ? rawData : (rawData.data || []);

        const todayStr = getLocalDateString();
        const normalizedInputName = normalizeName(name);

        // Filter today's real attendance entries (excluding status markers)
        const isAlreadyCheckedIn = data.some(item => {
            const itemDate = item.date ? item.date.split("T")[0] : "";
            return itemDate === todayStr && 
                   item.name !== "__MEETING_STATUS__" && 
                   normalizeName(item.name) === normalizedInputName;
        });

        if (isAlreadyCheckedIn) {
            button.disabled = false;
            button.innerHTML = "Record Attendance";
            message.innerHTML = `
                <div style="background:#fde8e8; color:#c0392b; padding:15px; border-radius:10px; margin-top:15px; text-align:center;">
                    ⚠️ <strong>Already Checked In!</strong><br>
                    "${name}" has already recorded attendance for today's meeting.
                </div>`;
            return;
        }

        // 2. Perform check-in if duplicate check passed
        button.innerHTML = "Submitting...";

        const postRes = await fetch(scriptURL, {
            method: "POST",
            headers: { "Content-Type": "text/plain;charset=utf-8" },
            body: JSON.stringify({
                action: "checkIn",
                name: name,
                church: church,
                country: country
            })
        });

        await postRes.json();

        if (church) localStorage.setItem("church", church);
        if (country) localStorage.setItem("country", country);

        form.style.display = "none";
        message.innerHTML = `
        <div style="font-size:65px;">✅</div>
        <h2>Attendance Recorded</h2>
        <p>Thank you, <strong>${name}</strong>!<br><br>Have a blessed fellowship today.</p>
        <button type="button" onclick="resetFormForNextPerson()" style="margin-top:20px; padding:12px 20px; background:#0B3D2E; color:white; border:none; border-radius:10px; cursor:pointer; font-weight:600;">
            ➕ Check In Another Person
        </button>
        `;
        launchConfetti();

    } catch (err) {
        console.error("Submission error:", err);
        button.disabled = false;
        button.innerHTML = "Record Attendance";
        message.innerHTML = "<span style='color:red;'>Something went wrong. Please check your connection and try again.</span>";
    }
});
