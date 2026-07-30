// =======================================
// DARK MODE TOGGLE (shared across pages)
// =======================================

(function () {

    const toggleBtn = document.getElementById("themeToggle");

    function applyTheme(theme) {
        if (theme === "dark") {
            document.body.classList.add("dark-mode");
            if (toggleBtn) toggleBtn.innerHTML = toggleBtn.innerHTML.includes("fa-")
                ? '<i class="fa-solid fa-sun"></i>'
                : "☀️";
        } else {
            document.body.classList.remove("dark-mode");
            if (toggleBtn) toggleBtn.innerHTML = toggleBtn.innerHTML.includes("fa-")
                ? '<i class="fa-solid fa-moon"></i>'
                : "🌙";
        }
    }

    const saved = localStorage.getItem("theme") || "light";
    applyTheme(saved);

    if (toggleBtn) {
        toggleBtn.addEventListener("click", () => {
            const current = document.body.classList.contains("dark-mode") ? "dark" : "light";
            const next = current === "dark" ? "light" : "dark";
            localStorage.setItem("theme", next);
            applyTheme(next);
        });
    }

})();
