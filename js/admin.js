// Session Authentication Guard
if (sessionStorage.getItem("loggedIn") !== "true") {
    window.location.replace("adlog.html");
}   

const scriptURL = "https://script.google.com/macros/s/AKfycbxh2uhCFdQ__pKb3Yy7QGS5u9P44f9wPZfMveLowW66iVp_KOll7FGbOfCAZq2NG5XV/exec";
const STATUS_MARKER = "__MEETING_STATUS__";

// Known country lookup list for smart field sorting
const KNOWN_COUNTRIES = new Set([
    "united states", "us", "usa", "cameroon", "nigeria", "ghana", "kenya", "uganda",
    "south africa", "united kingdom", "uk", "canada", "australia", "germany", "france",
    "india", "brazil", "philippines", "zambia", "zimbabwe", "malawi", "tanzania",
    "rwanda", "congo", "drc", "ethiopia", "liberia", "sierra leone", "togo", "benin",
    "ivory coast", "cote d'ivoire", "jamaica", "haiti", "trinidad", "barbados"
]);

function isLikelyCountry(str) {
    if (!str) return false;
    return KNOWN_COUNTRIES.has(str.trim().toLowerCase());
}

// DOM Elements
const attendanceList = document.getElementById("attendanceList");
const presentCount = document.getElementById("presentCount");
const churchCount = document.getElementById("churchCount");
const countryCount = document.getElementById("countryCount");
const percent = document.getElementById("percent");
const progressBar = document.getElementById("progressBar");
const progressText = document.getElementById("progressText");
const search = document.getElementById("search");
const countryFilterSelect = document.getElementById("countryFilterSelect");
const sortSelect = document.getElementById("sortSelect");
const refreshBtn = document.getElementById("refreshBtn");
const logoutBtn = document.getElementById("logoutBtn");
const exportBtn = document.getElementById("exportBtn");
const printBtn = document.getElementById("printBtn");
const addPastorBtn = document.getElementById("addPastorBtn");
const addPastorModal = document.getElementById("addPastorModal");
const closeModalBtn = document.getElementById("closeModalBtn");
const addPastorForm = document.getElementById("addPastorForm");
const editGoalBtn = document.getElementById("editGoalBtn");
const themeToggle = document.getElementById("themeToggle");
const todayDate = document.getElementById("todayDate");
const meetingStatus = document.getElementById("meetingStatus");
const meetingToggleBtn = document.getElementById("meetingToggleBtn");
const meetingDateSelect = document.getElementById("meetingDateSelect");
const attendanceListTitle = document.getElementById("attendanceListTitle");
const activityLog = document.getElementById("activityLog");
const clearLogBtn = document.getElementById("clearLogBtn");

// State
let allAttendanceData = [];
let augmentedData = [];
let realAttendance = [];
let pastors = [];
let attendanceGoal = parseInt(localStorage.getItem("attendanceGoal") || "30", 10);
let currentMeetingStatus = "closed";

let sessionCounterMap = {};
let lastStatusMap = {};
let sessionExistsMap = {};

function getLocalDateString(d = new Date()) {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// Check if a string is actually a raw date/time timestamp
function isDateTimeString(val) {
    if (!val || typeof val !== "string") return false;
    const str = val.trim();
    if (/GMT|UTC|1899|:\d{2}:\d{2}/i.test(str)) return true;
    if (str.length > 10 && !isNaN(Date.parse(str)) && /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun|\d{4}-\d{2}-\d{2})/i.test(str)) {
        return true;
    }
    return false;
}

function parseToYYYYMMDD(dateVal) {
    if (!dateVal) return "";
    
    if (typeof dateVal === "string" && /^\d{4}-\d{2}-\d{2}$/.test(dateVal.trim())) {
        return dateVal.trim();
    }
    
    const d = new Date(dateVal);
    if (!isNaN(d.getTime())) {
        if (d.getFullYear() > 1970) {
            return getLocalDateString(d);
        }
    }
    
    return "";
}

function makeSessionKey(date, session) {
    return `${date}::${session}`;
}

function parseSessionKey(key) {
    if (!key) return { date: getLocalDateString(), session: 1 };
    const [date, sessionStr] = key.split("::");
    return { date, session: parseInt(sessionStr, 10) || 1 };
}

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
        const next = document.body.classList.contains("dark-mode") ? "light" : "dark";
        localStorage.setItem("theme", next);
        applyAdminTheme(next);
    });
}

if (todayDate) {
    todayDate.innerHTML = new Date().toLocaleDateString("en-US", {
        weekday: "long", year: "numeric", month: "long", day: "numeric"
    });
}

function loadAttendance() {
    if (refreshBtn) {
        refreshBtn.disabled = true;
        refreshBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Refreshing';
    }

    fetch(scriptURL)
        .then(response => response.json())
        .then(data => {
            allAttendanceData = Array.isArray(data) ? data : (data.data || []);
            buildSessionData();
            populateMeetingSessions();
            populateCountryFilter();
            updateMeetingStatusUI();
            renderActivityLog();
            applySearchAndSort();

            if (refreshBtn) {
                refreshBtn.disabled = false;
                refreshBtn.innerHTML = '<i class="fa-solid fa-rotate-right"></i> Refresh';
            }
        })
        .catch(error => {
            console.error("Error loading data:", error);
            if (refreshBtn) {
                refreshBtn.disabled = false;
                refreshBtn.innerHTML = '<i class="fa-solid fa-rotate-right"></i> Refresh';
            }
        });
}

function buildSessionData() {
    sessionCounterMap = {};
    lastStatusMap = {};
    sessionExistsMap = {};
    augmentedData = [];

    allAttendanceData.forEach(item => {
        if (!item) return;

        let date = parseToYYYYMMDD(item.date);
        if (!date) date = parseToYYYYMMDD(item.church);
        if (!date) date = parseToYYYYMMDD(item.time);
        if (!date) date = parseToYYYYMMDD(item.country);
        if (!date) date = getLocalDateString();

        let cleanChurch = isDateTimeString(item.church) ? "" : (item.church || "").trim();
        let cleanCountry = isDateTimeString(item.country) ? "" : (item.country || "").trim();
        let cleanName = isDateTimeString(item.name) ? "" : (item.name || "").trim();

        if (!(date in sessionCounterMap)) {
            sessionCounterMap[date] = 1;
            lastStatusMap[date] = "closed";
            sessionExistsMap[date] = new Set();
        }

        if (item.name === STATUS_MARKER) {
            const status = (item.church || "").toLowerCase() === "closed" ? "closed" : "open";
            if (status === "open" && lastStatusMap[date] === "closed") {
                sessionCounterMap[date] += 1;
            }
            lastStatusMap[date] = status;
        }

        const session = sessionCounterMap[date];
        sessionExistsMap[date].add(session);

        augmentedData.push({ 
            ...item, 
            name: cleanName || item.name,
            church: cleanChurch,
            country: cleanCountry,
            __date: date, 
            __session: session 
        });
    });

    realAttendance = augmentedData.filter(item => item.name !== STATUS_MARKER);

    const today = getLocalDateString();
    currentMeetingStatus = lastStatusMap[today] || "closed";
}

function updateMeetingStatusUI() {
    if (!meetingStatus || !meetingToggleBtn) return;
    if (currentMeetingStatus === "open") {
        meetingStatus.innerHTML = "🟢 Meeting Open";
        meetingStatus.className = "status status-open";
        meetingToggleBtn.innerHTML = '<i class="fa-solid fa-lock"></i> Close Meeting';
        meetingToggleBtn.className = "toggle-meeting-btn btn-close";
    } else {
        meetingStatus.innerHTML = "🔴 Meeting Closed";
        meetingStatus.className = "status status-closed";
        meetingToggleBtn.innerHTML = '<i class="fa-solid fa-lock-open"></i> Open Meeting';
        meetingToggleBtn.className = "toggle-meeting-btn btn-open";
    }
}

function toggleMeetingStatus() {
    const nextStatus = currentMeetingStatus === "open" ? "closed" : "open";
    const confirmMsg = nextStatus === "closed" 
        ? "Are you sure you want to CLOSE today's meeting?" 
        : "Are you sure you want to OPEN today's meeting?";

    if (!confirm(confirmMsg)) return;

    if (meetingToggleBtn) meetingToggleBtn.disabled = true;

    fetch(scriptURL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({
            action: "checkIn",
            name: STATUS_MARKER,
            church: nextStatus,
            country: "System"
        })
    })
    .then(r => r.json())
    .then(() => {
        if (meetingToggleBtn) meetingToggleBtn.disabled = false;
        loadAttendance();
    })
    .catch(err => {
        console.error("Failed to toggle meeting:", err);
        alert("Failed to change meeting status. Check your connection.");
        if (meetingToggleBtn) meetingToggleBtn.disabled = false;
    });
}

function populateMeetingSessions() {
    if (!meetingDateSelect) return;
    const previousVal = meetingDateSelect.value;
    meetingDateSelect.innerHTML = "";

    const dates = Object.keys(sessionExistsMap).sort().reverse();
    if (dates.length === 0) {
        const todayKey = makeSessionKey(getLocalDateString(), 1);
        const opt = document.createElement("option");
        opt.value = todayKey;
        opt.textContent = `${getLocalDateString()} (Session 1)`;
        meetingDateSelect.appendChild(opt);
        return;
    }

    dates.forEach(d => {
        const sessions = Array.from(sessionExistsMap[d]).sort((a, b) => b - a);
        sessions.forEach(s => {
            const key = makeSessionKey(d, s);
            const opt = document.createElement("option");
            opt.value = key;
            opt.textContent = `${d} (Session ${s})`;
            meetingDateSelect.appendChild(opt);
        });
    });

    if (previousVal && Array.from(meetingDateSelect.options).some(o => o.value === previousVal)) {
        meetingDateSelect.value = previousVal;
    } else {
        const today = getLocalDateString();
        const latestSession = sessionCounterMap[today] || 1;
        meetingDateSelect.value = makeSessionKey(today, latestSession);
    }
}

function populateCountryFilter() {
    if (!countryFilterSelect) return;
    const currentVal = countryFilterSelect.value;

    const countries = new Set();
    realAttendance.forEach(p => {
        let country = (p.country || "").trim();
        let name = (p.name || "").trim();
        if (!country && isLikelyCountry(name)) country = name;
        if (country && !isDateTimeString(country)) {
            countries.add(country);
        }
    });

    countryFilterSelect.innerHTML = `<option value="">🌍 All Countries</option>`;
    Array.from(countries).sort().forEach(c => {
        const opt = document.createElement("option");
        opt.value = c;
        opt.textContent = c;
        countryFilterSelect.appendChild(opt);
    });
    countryFilterSelect.value = currentVal;
}

function renderActivityLog() {
    if (!activityLog) return;
    const today = getLocalDateString();
    const statusLogs = augmentedData.filter(item => item.__date === today && item.name === STATUS_MARKER);

    if (statusLogs.length === 0) {
        activityLog.innerHTML = `<p style="color:#888; font-size:13px;">No status events recorded for today. (Meeting is currently CLOSED)</p>`;
        return;
    }

    let logHtml = "";
    statusLogs.forEach(log => {
        const state = (log.church || "").toLowerCase();
        const badgeClass = state === "closed" ? "log-badge-closed" : "log-badge-open";
        logHtml += `
            <div class="log-item">
                <span class="log-time">${log.time || "Today"}</span>
                <span class="log-badge ${badgeClass}">${state.toUpperCase()}</span>
                <span class="log-desc">Meeting status changed to ${state}</span>
            </div>
        `;
    });
    activityLog.innerHTML = logHtml;
}

function displayPastors(list, isFiltered) {
    if (!attendanceList) return;
    attendanceList.innerHTML = "";

    const totalPresent = pastors.length;
    
    const uniqueChurches = new Set(
        pastors
            .map(p => (p.church || "").trim().toLowerCase())
            .filter(c => c && !isDateTimeString(c))
    ).size;

    const uniqueCountries = new Set(
        pastors
            .map(p => {
                let country = (p.country || "").trim();
                if (!country && isLikelyCountry(p.name)) country = p.name.trim();
                return country.toLowerCase();
            })
            .filter(c => c && !isDateTimeString(c))
    ).size;

    if (presentCount) presentCount.innerHTML = totalPresent;
    if (churchCount) churchCount.innerHTML = uniqueChurches;
    if (countryCount) countryCount.innerHTML = uniqueCountries;

    let progress = Math.min(Math.round((totalPresent / attendanceGoal) * 100), 100);
    if (percent) percent.innerHTML = progress + "%";
    if (progressText) progressText.innerHTML = progress + "%";
    if (progressBar) progressBar.style.width = progress + "%";

    if (list.length === 0) {
        attendanceList.innerHTML = isFiltered
            ? `<div class="person"><h2>No matches found for your filter.</h2></div>`
            : `<div class="person"><h2>No attendance recorded for this meeting.</h2></div>`;
        return;
    }

    let cardsHtml = "";
    list.forEach((person) => {
        let rawName = (person.name || "").trim();
        let rawChurch = isDateTimeString(person.church) ? "" : (person.church || "").trim();
        let rawCountry = isDateTimeString(person.country) ? "" : (person.country || "").trim();

        let displayName = "";
        let displayCountry = rawCountry;

        if (rawCountry) {
            displayCountry = rawCountry;
            displayName = rawName || "Pastor / Attendee";
        } else if (rawName) {
            if (isLikelyCountry(rawName)) {
                displayCountry = rawName;
                displayName = "Pastor / Attendee";
            } else {
                displayName = rawName;
                displayCountry = "Country unspecified";
            }
        } else {
            displayName = "Pastor / Attendee";
            displayCountry = "Country unspecified";
        }

        let displayChurch = rawChurch || "Church not provided";

        // Generate clean initials for the avatar circle
        let initials = "✝";
        if (displayName && displayName !== "Pastor / Attendee") {
            initials = displayName.split(/\s+/).filter(Boolean).map(w => w[0]).join("").substring(0, 2).toUpperCase();
        } else if (displayCountry && displayCountry !== "Country unspecified") {
            initials = displayCountry.substring(0, 2).toUpperCase();
        }

        cardsHtml += `
        <div class="person">
            <div class="person-header">
                <div class="avatar">${initials}</div>
                <div class="person-info">
                    <div class="person-name">${displayName}</div>
                    <div class="person-church">⛪ ${displayChurch}</div>
                    <div class="person-country">🌍 ${displayCountry}</div>
                </div>
                <button onclick="deleteEntry('${rawName.replace(/'/g, "\\'")}', '${person.date}')" class="delete-btn" title="Delete entry">
                    <i class="fa-solid fa-trash"></i>
                </button>
            </div>
        </div>`;
    });

    attendanceList.innerHTML = cardsHtml;
}

function deleteEntry(name, date) {
    if (!confirm(`Are you sure you want to delete the entry for ${name}?`)) return;

    fetch(scriptURL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ action: "deleteEntry", name: name, date: date })
    })
    .then(r => r.json())
    .then(() => loadAttendance())
    .catch(err => alert("Failed to delete entry."));
}

function applySearchAndSort() {
    const key = meetingDateSelect ? meetingDateSelect.value : makeSessionKey(getLocalDateString(), 1);
    const { date, session } = parseSessionKey(key);

    pastors = realAttendance.filter(person => person.__date === date && person.__session === session);

    const searchValue = search ? (search.value || "").toLowerCase() : "";
    const selectedCountry = countryFilterSelect ? countryFilterSelect.value : "";

    let filtered = pastors.filter(person => {
        let name = (person.name || "").toLowerCase();
        let church = (person.church || "").toLowerCase();
        let country = (person.country || (isLikelyCountry(person.name) ? person.name : "unspecified")).toLowerCase();

        const matchesSearch = name.includes(searchValue) ||
                              church.includes(searchValue) ||
                              country.includes(searchValue);
        const matchesCountry = !selectedCountry || country.trim() === selectedCountry.toLowerCase();
        return matchesSearch && matchesCountry;
    });

    const sortMode = sortSelect ? sortSelect.value : "recent";
    if (sortMode === "name") {
        filtered.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    } else if (sortMode === "church") {
        filtered.sort((a, b) => (a.church || "").localeCompare(b.church || ""));
    } else if (sortMode === "country") {
        filtered.sort((a, b) => (a.country || a.name || "").localeCompare(b.country || b.name || ""));
    }

    displayPastors(filtered, searchValue.length > 0 || selectedCountry.length > 0);
}

function exportToCSV() {
    if (!pastors || pastors.length === 0) {
        alert("No attendance data to export for the selected session.");
        return;
    }

    let csvContent = "data:text/csv;charset=utf-8,Full Name,Church / Ministry,Country,Time,Date\n";
    pastors.forEach(p => {
        let name = p.name || '';
        let country = p.country || '';
        if (!country && isLikelyCountry(name)) {
            country = name;
            name = '';
        }
        const row = [
            `"${name.replace(/"/g, '""')}"`,
            `"${(p.church || '').replace(/"/g, '""')}"`,
            `"${country.replace(/"/g, '""')}"`,
            `"${p.time || ''}"`,
            `"${p.date || ''}"`
        ];
        csvContent += row.join(",") + "\n";
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    const key = meetingDateSelect ? meetingDateSelect.value.replace("::", "_session_") : "attendance";
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Pastors_Attendance_${key}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// Key Event Listeners
if (logoutBtn) {
    logoutBtn.addEventListener("click", () => {
        sessionStorage.removeItem("loggedIn");
        window.location.replace("adlog.html");
    });
}

if (refreshBtn) refreshBtn.addEventListener("click", loadAttendance);
if (meetingToggleBtn) meetingToggleBtn.addEventListener("click", toggleMeetingStatus);
if (exportBtn) exportBtn.addEventListener("click", exportToCSV);
if (printBtn) printBtn.addEventListener("click", () => window.print());
if (addPastorBtn) addPastorBtn.addEventListener("click", () => addPastorModal.style.display = "flex");
if (closeModalBtn) closeModalBtn.addEventListener("click", () => addPastorModal.style.display = "none");

if (meetingDateSelect) meetingDateSelect.addEventListener("change", applySearchAndSort);
if (search) search.addEventListener("input", applySearchAndSort);
if (countryFilterSelect) countryFilterSelect.addEventListener("change", applySearchAndSort);
if (sortSelect) sortSelect.addEventListener("change", applySearchAndSort);

if (clearLogBtn) {
    clearLogBtn.addEventListener("click", () => {
        if (activityLog) activityLog.style.display = activityLog.style.display === "none" ? "block" : "none";
    });
}

if (editGoalBtn) {
    editGoalBtn.addEventListener("click", () => {
        const newGoal = prompt("Enter new target attendance goal:", attendanceGoal);
        if (newGoal && !isNaN(newGoal) && parseInt(newGoal, 10) > 0) {
            attendanceGoal = parseInt(newGoal, 10);
            localStorage.setItem("attendanceGoal", attendanceGoal);
            applySearchAndSort();
        }
    });
}

if (addPastorForm) {
    addPastorForm.addEventListener("submit", (e) => {
        e.preventDefault();
        const name = document.getElementById("manualName").value.trim();
        const church = document.getElementById("manualChurch").value.trim();
        const country = document.getElementById("manualCountry").value.trim();

        fetch(scriptURL, {
            method: "POST",
            headers: { "Content-Type": "text/plain;charset=utf-8" },
            body: JSON.stringify({ action: "checkIn", name, church, country })
        })
        .then(r => r.json())
        .then(() => {
            addPastorModal.style.display = "none";
            addPastorForm.reset();
            loadAttendance();
        })
        .catch(err => alert("Failed to add entry."));
    });
}

// Initial fetch on page load
loadAttendance();
