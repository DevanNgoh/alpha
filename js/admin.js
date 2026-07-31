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
// It is filtered out of the attendance list, count, search, and export,
// but used to build the meeting activity log and session history below.
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
const clearLogBtn = document.getElementById("clearLogBtn");

// =======================================
// STATE VARIABLES
// =======================================
let allAttendanceData = [];   // raw rows exactly as returned by the sheet
let augmentedData = [];       // raw rows + __date and __session attached
let realAttendance = [];      // augmentedData with status marker rows removed (actual people)
let pastors = [];              // realAttendance filtered down to the selected meeting session
let attendanceGoal = parseInt(localStorage.getItem("attendanceGoal") || "30", 10);
let currentMeetingStatus = "open"; // today's live status only

// Per-date session bookkeeping, rebuilt on every load
let sessionCounterMap = {};   // date -> highest session number seen so far
let lastStatusMap = {};       // date -> latest known status ("open"/"closed")
let sessionExistsMap = {};    // date -> Set of session numbers that have any entry

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

// Composite dropdown keys look like "2026-07-30::2" (date + session number)
function makeSessionKey(date, session) {
    return `${date}::${session}`;
}

function parseSessionKey(key) {
    if (!key) return { date: getLocalDateString(), session: 1 };
    const [date, sessionStr] = key.split("::");
    const session = parseInt(sessionStr, 10);
    return { date, session: isNaN(session) ? 1 : session };
}

// =======================================
// HIDDEN ACTIVITY LOGS (per-browser, reversible)
// "Clear Log" doesn't delete anything from the sheet — it just hides that
// meeting's open/close entries from view on this device. Toggling it back
// restores the exact same history.
// =======================================
function getHiddenLogs() {
    try {
        return JSON.parse(localStorage.getItem("hiddenActivityLogs") || "[]");
    } catch (e) {
        return [];
    }
}

function setHiddenLogs(list) {
    localStorage.setItem("hiddenActivityLogs", JSON.stringify(list));
}

function isLogHidden(date, session) {
    return getHiddenLogs().includes(makeSessionKey(date, session));
}

function setLogHidden(date, session, hidden) {
    const key = makeSessionKey(date, session);
    const hiddenLogs = getHiddenLogs().filter(k => k !== key);
    if (hidden) hiddenLogs.push(key);
    setHiddenLogs(hiddenLogs);
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

            buildSessionData();
            populateMeetingSessions();
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
// BUILD MEETING SESSIONS
// =======================================
// Walks every row in the order the sheet returned it (chronological) and
// assigns each one a __date and __session number. A new session begins
// each time the admin clicks "Reopen" after having closed the meeting, so
// two separate meetings on the same calendar day are kept fully distinct
// and are each permanently viewable in the dropdown below.
function buildSessionData() {
    sessionCounterMap = {};
    lastStatusMap = {};
    sessionExistsMap = {};
    augmentedData = [];

    allAttendanceData.forEach(item => {
        const date = parseToYYYYMMDD(item.date);
        if (!date) return;

        if (!(date in sessionCounterMap)) {
            sessionCounterMap[date] = 1;
            lastStatusMap[date] = "open";
            sessionExistsMap[date] = new Set();
        }

        if (item.name === STATUS_MARKER) {
            const status = (item.church || "").toLowerCase() === "closed" ? "closed" : "open";

            if (status === "open" && lastStatusMap[date] === "closed") {
                // A reopen after a close starts a brand-new session
                sessionCounterMap[date] += 1;
            }

            lastStatusMap[date] = status;
        }

        const session = sessionCounterMap[date];
        sessionExistsMap[date].add(session);
        augmentedData.push({ ...item, __date: date, __session: session });
    });

    realAttendance = augmentedData.filter(item => item.name !== STATUS_MARKER);
}

// =======================================
// MEETING OPEN / CLOSED STATE (today, live)
// =======================================
function getMeetingStatusForToday() {
    const todayStr = getLocalDateString();
    return lastStatusMap[todayStr] || "open";
}

function getLiveSessionForToday() {
    const todayStr = getLocalDateString();
    return sessionCounterMap[todayStr] || 1;
}

function updateMeetingStatusUI(date, session) {
    const todayStr = getLocalDateString();
    const isLiveSession = date === todayStr && session === getLiveSessionForToday();

    if (isLiveSession) {
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

        const totalSessions = sessionExistsMap[date] ? sessionExistsMap[date].size : 1;
        const label = totalSessions > 1 ? `${date}, Session ${session}` : date;
        if (attendanceListTitle) attendanceListTitle.textContent = `Meeting Attendance (${label})`;
    }
}

// =======================================
// MEETING ACTIVITY LOG (close/reopen history)
// Shows every __MEETING_STATUS__ entry that belongs to the selected
// session, in the order it was recorded. Works for today and any past
// date/session, so this history is never lost from the sheet — "Clear
// Log" below only hides it from view on this browser.
// =======================================
function renderActivityLog(date, session) {
    if (!activityLog) return;

    const hidden = isLogHidden(date, session);
    updateClearLogButton(hidden);

    if (hidden) {
        activityLog.innerHTML = `<p class="activity-empty">Log cleared for this meeting on this device. Click "Restore Log" to bring it back.</p>`;
        return;
    }

    const entries = augmentedData.filter(item =>
        item.name === STATUS_MARKER && item.__date === date && item.__session === session
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

function updateClearLogButton(hidden) {
    if (!clearLogBtn) return;
    clearLogBtn.classList.toggle("log-hidden", hidden);
    clearLogBtn.innerHTML = hidden
        ? '<i class="fa-solid fa-eye"></i> Restore Log'
        : '<i class="fa-solid fa-eye-slash"></i> Clear Log';
}

if (clearLogBtn) {
    clearLogBtn.addEventListener("click", () => {
        const key = meetingDateSelect ? meetingDateSelect.value : makeSessionKey(getLocalDateString(), 1);
        const { date, session } = parseSessionKey(key);
        const currentlyHidden = isLogHidden(date, session);

        setLogHidden(date, session, !currentlyHidden);
        renderActivityLog(date, session);
    });
}

if (meetingToggleBtn) {
    meetingToggleBtn.addEventListener("click", () => {
        const newStatus = currentMeetingStatus === "open" ? "closed" : "open";
        const verb = newStatus === "closed" ? "close" : "reopen";
        const explanation = newStatus === "closed"
            ? "This will stop people from checking in until you reopen."
            : "This starts a brand-new meeting for today, kept separate from the one you just closed.";

        if (!confirm(`Are you sure you want to ${verb} the meeting? ${explanation}`)) {
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
                const { date, session } = parseSessionKey(meetingDateSelect ? meetingDateSelect.value : "");
                updateMeetingStatusUI(date, session);
            });
    });
}

// =======================================
// POPULATE MEETING / SESSION DROPDOWN
// =======================================
function populateMeetingSessions() {
    if (!meetingDateSelect) return;

    const selectedValue = meetingDateSelect.value;
    const todayStr = getLocalDateString();

    // Make sure today's live session always exists, even with zero attendees
    if (!(todayStr in sessionCounterMap)) {
        sessionCounterMap[todayStr] = 1;
        lastStatusMap[todayStr] = "open";
        sessionExistsMap[todayStr] = new Set([1]);
    }

    // Build a flat list of {date, session} across every date we know about
    const rows = [];
    Object.keys(sessionExistsMap).forEach(date => {
        sessionExistsMap[date].forEach(session => {
            rows.push({ date, session });
        });
    });

    // Most recent date first, and within a date, most recent session first
    rows.sort((a, b) => {
        if (a.date !== b.date) return new Date(b.date) - new Date(a.date);
        return b.session - a.session;
    });

    meetingDateSelect.innerHTML = "";

    rows.forEach(({ date, session }) => {
        const option = document.createElement("option");
        const key = makeSessionKey(date, session);
        option.value = key;

        const isToday = date === todayStr;
        const isLiveSession = isToday && session === sessionCounterMap[todayStr];
        const totalSessions = sessionExistsMap[date].size;

        let label;
        if (isLiveSession) {
            label = totalSessions > 1 ? `Today - Session ${session} (Live)` : `Today (${date}) - Live`;
        } else if (isToday) {
            label = `Today - Session ${session}`;
        } else {
            label = totalSessions > 1 ? `${date} - Session ${session}` : date;
        }

        option.textContent = label;
        meetingDateSelect.appendChild(option);
    });

    const liveKey = makeSessionKey(todayStr, sessionCounterMap[todayStr]);
    const availableKeys = rows.map(r => makeSessionKey(r.date, r.session));

    if (selectedValue && availableKeys.includes(selectedValue)) {
        meetingDateSelect.value = selectedValue;
    } else {
        meetingDateSelect.value = liveKey;
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
    const key = meetingDateSelect ? meetingDateSelect.value : makeSessionKey(getLocalDateString(), 1);
    const { date, session } = parseSessionKey(key);

    updateMeetingStatusUI(date, session);
    renderActivityLog(date, session);

    pastors = realAttendance.filter(person => person.__date === date && person.__session === session);

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
    const key = meetingDateSelect ? meetingDateSelect.value : makeSessionKey(getLocalDateString(), 1);
    const { date, session } = parseSessionKey(key);
    const totalSessions = sessionExistsMap[date] ? sessionExistsMap[date].size : 1;
    const filenameSuffix = totalSessions > 1 ? `${date}_session${session}` : date;

    const link = document.createElement("a");
    link.href = url;
    link.download = `attendance-${filenameSuffix}.csv`;
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
