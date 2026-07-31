// =======================================
// LOGIN PROTECTION
// =======================================
if (sessionStorage.getItem("loggedIn") !== "true") {
    window.location.replace("login.html");
}

// =======================================
// GOOGLE APPS SCRIPT URL
// =======================================
const scriptURL = "https://script.google.com/macros/s/AKfycbxENWyvJtzuqPeMfAXStAMzk9pYB9qS2HZS_q3gCglp50ddf06ssy1cdkGPqNSaycSL/exec";

// Sentinel "name" used to store meeting open/closed state as a normal
// row through the existing endpoint (no backend changes needed).
// It is filtered out of every attendance list, count, search, and export.
const STATUS_MARKER = "__MEETING_STATUS__";

// =======================================
// DOM ELEMENTS
// =======================================
const attendanceList = document.getElementById("attendanceList");
const presentCount = document.getElementById("presentCount");
const percent = document.getElementById("percent");
const progressBar = document.getElementById("progressBar");
const progressText = document.getElementById("progressText");
const search = document.getElementById("search");
const sortSelect = document.getElementById("sortSelect");
const refreshBtn = document.getElementById("refreshBtn");
const logoutBtn = document.getElementById("logoutBtn");
const exportBtn = document.getElementById("exportBtn");
const editGoalBtn = document.getElementById("editGoalBtn");
const themeToggle = document.getElementById("themeToggle");
const todayDate = document.getElementById("todayDate");
const lastRefresh = document.getElementById("lastRefresh");
const meetingStatus = document.getElementById("meetingStatus");
const meetingToggleBtn = document.getElementById("meetingToggleBtn");
const meetingDateSelect = document.getElementById("meetingDateSelect");
const attendanceListTitle = document.getElementById("attendanceListTitle");
const activityLog = document.getElementById("activityLog");

// Modal Elements
const meetingModal = document.getElementById("meetingModal");
const closeModalBtn = document.getElementById("closeModalBtn");
const viewMeetingBtn = document.getElementById("viewMeetingBtn");
const modalMeetingTitle = document.getElementById("modalMeetingTitle");
const modalMeetingDate = document.getElementById("modalMeetingDate");
const modalTotalPresent = document.getElementById("modalTotalPresent");
const modalParticipantsList = document.getElementById("modalParticipantsList");

// =======================================
// STATE VARIABLES
// =======================================
let allAttendanceData = [];   // raw rows exactly as returned by the sheet (includes status markers)
let realAttendance = [];      // rows with status markers filtered out (actual people)
let pastors = [];              // realAttendance filtered down to the selected meeting date
let attendanceGoal = parseInt(localStorage.getItem("attendanceGoal") || "30", 10);
let currentMeetingStatus = "open"; // only meaningful for today

// =======================================
// HELPER: LOCAL DATE FORMATTER (YYYY-MM-DD)
// Avoids UTC offset bugs from toISOString()
// =======================================
function getLocalDateString(d = new Date()) {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function parseToYYYYMMDD(dateVal) {
    if (!dateVal) return "";

    // Handle YYYY-MM-DD string directly
    if (typeof dateVal === "string" && /^\d{4}-\d{2}-\d{2}$/.test(dateVal.trim())) {
        return dateVal.trim();
    }

    const d = new Date(dateVal);
    if (isNaN(d.getTime())) return String(dateVal).trim();
    return getLocalDateString(d);
}

// =======================================
// THEME MANAGEMENT (DARK MODE)
// =======================================
function applyAdminTheme(theme) {
    if (theme === "dark") {
        document.body.classList.add("dark-mode");
        if (themeToggle) themeToggle.innerHTML = '<i class="fa-solid fa-sun"></i>';
    } else {
        document.body.classList.remove("dark-mode");
        if (themeToggle) themeToggle.innerHTML = '<i class="fa-solid fa-moon"></i>';
    }
}

applyAdminTheme(localStorage.getItem("theme") || "light");

if (themeToggle) {
    themeToggle.addEventListener("click", () => {
        const current = document.body.classList.contains("dark-mode") ? "dark" : "light";
        const next = current === "dark" ? "light" : "dark";
        localStorage.setItem("theme", next);
        applyAdminTheme(next);
    });
}

// =======================================
// SET TODAY'S DATE IN HEADER
// =======================================
if (todayDate) {
    const today = new Date();
    todayDate.innerHTML = today.toLocaleDateString("en-US", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric"
    });
}

// =======================================
// FETCH ATTENDANCE DATA FROM GOOGLE APPS SCRIPT
// =======================================
function loadAttendance() {
    if (refreshBtn) {
        refreshBtn.disabled = true;
        refreshBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Refreshing';
    }

    fetch(scriptURL)
        .then(response => {
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            return response.json();
        })
        .then(data => {
            console.log("Data received from Apps Script:", data);

            if (Array.isArray(data)) {
                allAttendanceData = data;
            } else if (data && Array.isArray(data.data)) {
                allAttendanceData = data.data;
            } else {
                allAttendanceData = [];
            }

            realAttendance = allAttendanceData.filter(item => item.name !== STATUS_MARKER);

            populateMeetingDates();
            applySearchAndSort();
            updateRefreshTime();

            if (refreshBtn) {
                refreshBtn.disabled = false;
                refreshBtn.innerHTML = '<i class="fa-solid fa-rotate-right"></i> Refresh';
            }
        })
        .catch(error => {
            console.error("Error loading data:", error);
            if (attendanceList) {
                attendanceList.innerHTML = `<div class="person"><h2>Unable to load attendance. Check your connection or Apps Script setup.</h2></div>`;
            }

            if (refreshBtn) {
                refreshBtn.disabled = false;
                refreshBtn.innerHTML = '<i class="fa-solid fa-rotate-right"></i> Refresh';
            }
        });
}

// =======================================
// MEETING OPEN / CLOSED STATE
// =======================================
function getMeetingStatusForToday() {
    const todayStr = getLocalDateString();
    const statusEntries = allAttendanceData.filter(item =>
        item.name === STATUS_MARKER && parseToYYYYMMDD(item.date) === todayStr
    );

    if (statusEntries.length === 0) return "open";

    const last = statusEntries[statusEntries.length - 1];
    return (last.church || "").toLowerCase() === "closed" ? "closed" : "open";
}

function updateMeetingStatusUI(selectedDate) {
    const todayStr = getLocalDateString();
    const isToday = selectedDate === todayStr;

    if (isToday) {
        currentMeetingStatus = getMeetingStatusForToday();

        if (meetingStatus) {
            meetingStatus.innerHTML = currentMeetingStatus === "open"
                ? "🟢 Meeting Open"
                : "🔴 Meeting Closed";
            meetingStatus.classList.toggle("status-closed", currentMeetingStatus === "closed");
        }

        if (meetingToggleBtn) {
            meetingToggleBtn.style.display = "inline-flex";
            meetingToggleBtn.disabled = false;
            meetingToggleBtn.innerHTML = currentMeetingStatus === "open"
                ? '<i class="fa-solid fa-lock"></i> Close Meeting'
                : '<i class="fa-solid fa-lock-open"></i> Reopen Meeting';
        }

        if (attendanceListTitle) attendanceListTitle.textContent = "Today's Attendance";
    } else {
        if (meetingStatus) {
            meetingStatus.innerHTML = "🔒 Past Meeting (History)";
            meetingStatus.classList.remove("status-closed");
        }

        if (meetingToggleBtn) meetingToggleBtn.style.display = "none";

        if (attendanceListTitle) attendanceListTitle.textContent = `Meeting Attendance (${selectedDate})`;
    }
}

// =======================================
// MEETING ACTIVITY LOG
// =======================================
function renderActivityLog(selectedDate) {
    if (!activityLog) return;

    const entries = allAttendanceData.filter(item =>
        item.name === STATUS_MARKER && parseToYYYYMMDD(item.date) === selectedDate
    );

    if (entries.length === 0) {
        activityLog.innerHTML = `<p class="activity-empty">No open/close activity recorded for this meeting.</p>`;
        return;
    }

    let html = "";
    entries.forEach(entry => {
        const status = (entry.church || "").toLowerCase() === "closed" ? "closed" : "open";
        const icon = status === "closed" ? "🔴" : "🟢";
        const label = status === "closed" ? "Meeting Closed" : "Meeting Reopened";
        const time = entry.time || "";

        html += `
        <div class="activity-entry ${status === "closed" ? "activity-closed" : "activity-open"}">
            <span class="activity-icon">${icon}</span>
            <span class="activity-label">${label}</span>
            ${time ? `<span class="activity-time">${time}</span>` : ""}
        </div>`;
    });

    activityLog.innerHTML = html;
}

if (meetingToggleBtn) {
    meetingToggleBtn.addEventListener("click", () => {
        const newStatus = currentMeetingStatus === "open" ? "closed" : "open";
        const verb = newStatus === "closed" ? "close" : "reopen";

        if (!confirm(`Are you sure you want to ${verb} the meeting? This will ${newStatus === "closed" ? "stop" : "allow"} people from checking in.`)) {
            return;
        }

        meetingToggleBtn.disabled = true;
        meetingToggleBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Updating...';

        fetch(scriptURL, {
            method: "POST",
            headers: { "Content-Type": "text/plain;charset=utf-8" },
            body: JSON.stringify({ name: STATUS_MARKER, church: newStatus })
        })
            .then(r => r.json())
            .then(() => {
                loadAttendance();
            })
            .catch(err => {
                console.error("Error updating meeting status:", err);
                alert("Could not update meeting status. Please check your connection and try again.");
                meetingToggleBtn.disabled = false;
                updateMeetingStatusUI(meetingDateSelect ? meetingDateSelect.value : getLocalDateString());
            });
    });
}

// =======================================
// POPULATE MEETING DATES DROPDOWN
// =======================================
function populateMeetingDates() {
    if (!meetingDateSelect) return;

    const selectedValue = meetingDateSelect.value;
    const todayStr = getLocalDateString();

    const uniqueDates = [...new Set(realAttendance.map(item => parseToYYYYMMDD(item.date)).filter(Boolean))];

    if (!uniqueDates.includes(todayStr)) {
        uniqueDates.push(todayStr);
    }

    uniqueDates.sort((a, b) => new Date(b) - new Date(a));
    meetingDateSelect.innerHTML = "";

    uniqueDates.forEach(dateStr => {
        const option = document.createElement("option");
        option.value = dateStr;
        option.textContent = dateStr === todayStr ? `Today (${dateStr}) - Live` : dateStr;
        meetingDateSelect.appendChild(option);
    });

    if (selectedValue && uniqueDates.includes(selectedValue)) {
        meetingDateSelect.value = selectedValue;
    } else {
        meetingDateSelect.value = todayStr;
    }
}

// =======================================
// RENDER ATTENDANCE CARDS & STATS
// =======================================
function displayPastors(list, isFiltered) {
    if (!attendanceList) return;

    attendanceList.innerHTML = "";
    if (presentCount) presentCount.innerHTML = pastors.length;

    let progress = Math.round((pastors.length / attendanceGoal) * 100);
    if (progress > 100) progress = 100;

    if (percent) percent.innerHTML = progress + "%";
    if (progressText) progressText.innerHTML = progress + "%";
    if (progressBar) progressBar.style.width = progress + "%";

    if (list.length === 0) {
        attendanceList.innerHTML = isFiltered
            ? `<div class="person"><h2>No matches found for your search.</h2></div>`
            : `<div class="person"><h2>No attendance recorded for this meeting.</h2></div>`;
        return;
    }

    let cardsHtml = "";
    list.forEach(person => {
        let initials = "";
        if (person.name) {
            initials = person.name
                .trim()
                .split(/\s+/)
                .map(word => word[0])
                .join("")
                .substring(0, 2)
                .toUpperCase();
        }

        cardsHtml += `
        <div class="person">
            <div class="person-header">
                <div class="avatar">${initials || "✝"}</div>
                <div class="person-info">
                    <div class="person-name">${person.name || "Unknown"}</div>
                    <div class="person-church">⛪ ${person.church || "Church not provided"}</div>
                </div>
                <div class="status-badge">🟢 Present</div>
            </div>
        </div>`;
    });

    attendanceList.innerHTML = cardsHtml;
}

// =======================================
// FILTER, SEARCH & SORT
// =======================================
function applySearchAndSort() {
    const todayStr = getLocalDateString();
    const selectedDate = meetingDateSelect ? meetingDateSelect.value : todayStr;

    updateMeetingStatusUI(selectedDate);
    renderActivityLog(selectedDate);

    pastors = realAttendance.filter(person => {
        const pDate = parseToYYYYMMDD(person.date);
        if (!pDate) return selectedDate === todayStr;
        return pDate === selectedDate;
    });

    const searchValue = search ? (search.value || "").toLowerCase() : "";

    let filtered = pastors.filter(person => {
        return (person.name || "").toLowerCase().includes(searchValue) ||
               (person.church || "").toLowerCase().includes(searchValue);
    });

    const sortMode = sortSelect ? sortSelect.value : "recent";
    if (sortMode === "name") {
        filtered = [...filtered].sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    } else if (sortMode === "church") {
        filtered = [...filtered].sort((a, b) => (a.church || "").localeCompare(b.church || ""));
    }

    displayPastors(filtered, searchValue.length > 0);
}

// Event Listeners for controls
if (search) search.addEventListener("input", applySearchAndSort);
if (sortSelect) sortSelect.addEventListener("change", applySearchAndSort);
if (meetingDateSelect) meetingDateSelect.addEventListener("change", applySearchAndSort);

// =======================================
// PAST MEETING DETAILS MODAL LOGIC
// =======================================
function openMeetingDetails(dateStr) {
    if (!meetingModal) return;

    const targetDate = dateStr || (meetingDateSelect ? meetingDateSelect.value : getLocalDateString());
    const attendees = realAttendance.filter(item => parseToYYYYMMDD(item.date) === targetDate);

    if (modalMeetingTitle) modalMeetingTitle.textContent = `Meeting Details (${targetDate})`;
    if (modalMeetingDate) modalMeetingDate.textContent = targetDate;
    if (modalTotalPresent) modalTotalPresent.textContent = attendees.length;

    if (!modalParticipantsList) return;

    if (attendees.length === 0) {
        modalParticipantsList.innerHTML = `<p class="activity-empty">No participants recorded for this meeting date.</p>`;
    } else {
        let html = "";
        attendees.forEach(person => {
            html += `
            <div class="participant-item">
                <div class="participant-info">
                    <div class="name">${person.name || "Unknown"}</div>
                    <div class="church">⛪ ${person.church || "Church not provided"}</div>
                </div>
                ${person.time ? `<div class="participant-time">🕒 ${person.time}</div>` : ""}
            </div>`;
        });
        modalParticipantsList.innerHTML = html;
    }

    meetingModal.style.display = "flex";
}

function closeMeetingModal() {
    if (meetingModal) meetingModal.style.display = "none";
}

if (viewMeetingBtn) {
    viewMeetingBtn.addEventListener("click", () => {
        const dateStr = meetingDateSelect ? meetingDateSelect.value : getLocalDateString();
        openMeetingDetails(dateStr);
    });
}

if (closeModalBtn) {
    closeModalBtn.addEventListener("click", closeMeetingModal);
}

window.addEventListener("click", (e) => {
    if (e.target === meetingModal) closeMeetingModal();
});

// =======================================
// EDITABLE ATTENDANCE GOAL
// =======================================
if (editGoalBtn) {
    editGoalBtn.addEventListener("click", () => {
        const input = prompt("Set expected attendance goal (used for progress %):", attendanceGoal);
        const parsed = parseInt(input, 10);

        if (!isNaN(parsed) && parsed > 0) {
            attendanceGoal = parsed;
            localStorage.setItem("attendanceGoal", attendanceGoal.toString());
            applySearchAndSort();
        }
    });
}

// =======================================
// CSV EXPORT
// =======================================
function exportCSV() {
    if (pastors.length === 0) {
        alert("No attendance data to export for this meeting.");
        return;
    }

    const rows = [["Name", "Church", "Time", "Date"]];
    pastors.forEach(p => rows.push([p.name || "", p.church || "", p.time || "", p.date || ""]));

    const csvContent = rows
        .map(row => row.map(field => `"${String(field).replace(/"/g, '""')}"`).join(","))
        .join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const selectedDate = meetingDateSelect ? meetingDateSelect.value : getLocalDateString();

    const link = document.createElement("a");
    link.href = url;
    link.download = `attendance-${selectedDate}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

if (exportBtn) exportBtn.addEventListener("click", exportCSV);

// =======================================
// REFRESH TIMESTAMP & CONTROLS
// =======================================
function updateRefreshTime() {
    if (lastRefresh) {
        const now = new Date();
        lastRefresh.innerHTML = now.toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit"
        });
    }
}

if (refreshBtn) refreshBtn.addEventListener("click", loadAttendance);

if (logoutBtn) {
    logoutBtn.addEventListener("click", () => {
        if (confirm("Are you sure you want to log out?")) {
            sessionStorage.removeItem("loggedIn");
            window.location.replace("login.html");
        }
    });
}

// Automatically load data on page open and auto-refresh every 30 seconds
setInterval(loadAttendance, 30000);
loadAttendance();
