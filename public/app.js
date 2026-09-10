// Dynamic API Base URL resolution for Firebase Hosting & Render deployment
const API_BASE_URL = (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1")
  ? ""
  : (window.RENDER_BACKEND_URL || localStorage.getItem("backend_api_url") || "https://indian-railways-enquiry-backend.onrender.com");

// App state and event handlers
document.addEventListener("DOMContentLoaded", () => {
  initLanguage();
  initTabs();
  initTheme();
  initAccordions();
  initForms();
  initChatbot();
  initLeftMenu();
});

// 0. Language Localization
function initLanguage() {
  const langSelect = document.getElementById("language-select");
  const savedLang = localStorage.getItem("rail_lang") || "en";

  if (window.I18N) {
    window.I18N.setLanguage(savedLang);
  }

  if (langSelect) {
    langSelect.value = savedLang;
    langSelect.addEventListener("change", (e) => {
      if (window.I18N) {
        window.I18N.setLanguage(e.target.value);
      }
    });
  }
}

// 1. Tab Navigation System
function initTabs() {
  const tabs = document.querySelectorAll(".tab-link");
  const panes = document.querySelectorAll(".tab-pane");

  tabs.forEach(tab => {
    tab.addEventListener("click", () => {
      tabs.forEach(t => t.classList.remove("active"));
      panes.forEach(p => p.classList.remove("active"));

      tab.classList.add("active");
      const targetId = tab.getAttribute("data-tab");
      document.getElementById(targetId).classList.add("active");
    });
  });
}

// 2. Dark/Light Theme Handler
function initTheme() {
  const themeToggle = document.getElementById("theme-toggle");
  const body = document.body;

  const savedTheme = localStorage.getItem("theme");
  if (savedTheme === "dark") {
    body.classList.replace("light-mode", "dark-mode");
    themeToggle.querySelector("span").textContent = "light_mode";
  }

  themeToggle.addEventListener("click", () => {
    if (body.classList.contains("light-mode")) {
      body.classList.replace("light-mode", "dark-mode");
      themeToggle.querySelector("span").textContent = "light_mode";
      localStorage.setItem("theme", "dark");
    } else {
      body.classList.replace("dark-mode", "light-mode");
      themeToggle.querySelector("span").textContent = "dark_mode";
      localStorage.setItem("theme", "light");
    }
  });
}

// 3. Sidebar Accordion Rules
function initAccordions() {
  const headers = document.querySelectorAll(".accordion-header");

  headers.forEach(header => {
    header.addEventListener("click", () => {
      const item = header.parentElement;
      const isActive = item.classList.contains("active");

      document.querySelectorAll(".accordion-item").forEach(i => i.classList.remove("active"));

      if (!isActive) {
        item.classList.add("active");
      }
    });
  });
}

// 4. API Search Forms Implementation
function initForms() {
  // PNR form submission
  const pnrForm = document.getElementById("pnr-form");
  pnrForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const pnrInput = document.getElementById("pnr-input").value.trim();
    if (!/^\d{10}$/.test(pnrInput)) {
      alert("Please enter a valid 10-digit PNR.");
      return;
    }

    const resultPanel = document.getElementById("pnr-result");
    showLoader(resultPanel);

    // 1. Try Direct Nationwide Live API
    if (window.LiveRailAPI) {
      try {
        const liveData = await window.LiveRailAPI.getPNRStatus(pnrInput);
        if (liveData && liveData.passengers && liveData.passengers.length > 0) {
          renderPNRResult(liveData, false);
          return;
        }
      } catch (liveErr) {
        console.warn("LiveRailAPI PNR fetch failed, trying backend:", liveErr);
      }
    }

    // 2. Try Backend Server API
    if (API_BASE_URL) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3500);
        const response = await fetch(`${API_BASE_URL}/api/pnr/${pnrInput}`, { signal: controller.signal });
        clearTimeout(timeoutId);
        if (response.ok) {
          const data = await response.json();
          renderPNRResult(data, false);
          return;
        }
      } catch (err) {
        console.warn("Backend PNR fetch failed:", err);
      }
    }

    // 3. Fallback to Offline Engine
    if (window.OfflineRailDB) {
      const offlineData = window.OfflineRailDB.getPNR(pnrInput);
      renderPNRResult(offlineData, true);
    } else {
      renderError(resultPanel, "Failed to fetch PNR status.");
    }
  });

  // Seat Availability form
  const seatsForm = document.getElementById("seats-form");
  seatsForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const trainNo = document.getElementById("seat-train-input").value.trim();
    const src = document.getElementById("seat-src-input").value.trim();
    const dst = document.getElementById("seat-dst-input").value.trim();
    const date = document.getElementById("seat-date-input").value;
    const classCode = document.getElementById("seat-class-select").value;
    const quota = document.getElementById("seat-quota-select").value;

    const resultPanel = document.getElementById("seats-result");
    showLoader(resultPanel);

    // 1. Try Direct Nationwide Live API
    if (window.LiveRailAPI) {
      try {
        const liveData = await window.LiveRailAPI.getSeatAvailability(trainNo, src, dst, date, classCode, quota);
        if (liveData && liveData.availability && liveData.availability.length > 0) {
          renderSeatsResult(liveData, false);
          return;
        }
      } catch (liveErr) {
        console.warn("LiveRailAPI seat availability lookup failed, trying backend:", liveErr);
      }
    }

    // 2. Try Backend Server API
    if (API_BASE_URL) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3500);
        const url = `${API_BASE_URL}/api/trains/seats?train_no=${encodeURIComponent(trainNo)}&source=${encodeURIComponent(src)}&destination=${encodeURIComponent(dst)}&date=${date}&class_code=${classCode}&quota=${quota}`;
        const response = await fetch(url, { signal: controller.signal });
        clearTimeout(timeoutId);
        if (response.ok) {
          const data = await response.json();
          renderSeatsResult(data, false);
          return;
        }
      } catch (err) {
        console.warn("Backend seats fetch failed:", err);
      }
    }

    // 3. Fallback to Offline Engine
    if (window.OfflineRailDB) {
      const offlineData = window.OfflineRailDB.getSeats(trainNo, src, dst, date, classCode, quota);
      renderSeatsResult(offlineData, true);
    } else {
      renderError(resultPanel, "Seat/Fare details unavailable.");
    }
  });

  // Train between Stations form (Nationwide Live Data)
  const trainsForm = document.getElementById("trains-form");
  trainsForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const src = document.getElementById("trains-src-input").value.trim();
    const dst = document.getElementById("trains-dst-input").value.trim();

    const resultPanel = document.getElementById("trains-result");
    showLoader(resultPanel);

    // 1. Try Direct Nationwide Live API
    if (window.LiveRailAPI) {
      try {
        const liveData = await window.LiveRailAPI.searchTrains(src, dst);
        if (liveData && liveData.length > 0) {
          renderTrainsResult(liveData, src, dst, false, true);
          return;
        }
      } catch (liveErr) {
        console.warn("LiveRailAPI search error, trying backend:", liveErr);
      }
    }

    // 2. Try Backend Server API
    if (API_BASE_URL) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3500);
        const url = `${API_BASE_URL}/api/trains/search?source=${encodeURIComponent(src)}&destination=${encodeURIComponent(dst)}`;
        const response = await fetch(url, { signal: controller.signal });
        clearTimeout(timeoutId);
        if (response.ok) {
          const data = await response.json();
          if (data && data.length > 0) {
            renderTrainsResult(data, src, dst, false, false);
            return;
          }
        }
      } catch (err) {
        console.warn("Backend train search failed:", err);
      }
    }

    // 3. Fallback to Offline Engine
    if (window.OfflineRailDB) {
      const offlineData = window.OfflineRailDB.searchTrains(src, dst);
      renderTrainsResult(offlineData, src, dst, true, false);
    } else {
      renderError(resultPanel, "No trains found for the selected route.");
    }
  });

  // Swap stations button
  const swapBtn = document.getElementById("swap-stations-btn");
  swapBtn.addEventListener("click", () => {
    const srcInput = document.getElementById("trains-src-input");
    const dstInput = document.getElementById("trains-dst-input");
    const temp = srcInput.value;
    srcInput.value = dstInput.value;
    dstInput.value = temp;
  });

  // Train Schedule form
  const scheduleForm = document.getElementById("schedule-form");
  scheduleForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const trainNo = document.getElementById("schedule-input").value.trim();

    const resultPanel = document.getElementById("schedule-result");
    showLoader(resultPanel);

    // 1. Try Direct Nationwide Live API
    if (window.LiveRailAPI) {
      try {
        const liveData = await window.LiveRailAPI.getTrainSchedule(trainNo);
        if (liveData && liveData.schedule && liveData.schedule.length > 0) {
          renderScheduleResult(liveData, false);
          return;
        }
      } catch (liveErr) {
        console.warn("LiveRailAPI schedule failed, trying backend:", liveErr);
      }
    }

    // 2. Try Backend Server API
    if (API_BASE_URL) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3500);
        const response = await fetch(`${API_BASE_URL}/api/trains/schedule/${encodeURIComponent(trainNo)}`, { signal: controller.signal });
        clearTimeout(timeoutId);
        if (response.ok) {
          const data = await response.json();
          renderScheduleResult(data, false);
          return;
        }
      } catch (err) {
        console.warn("Backend schedule fetch failed:", err);
      }
    }

    // 3. Fallback to Offline Engine
    if (window.OfflineRailDB) {
      const offlineData = window.OfflineRailDB.getSchedule(trainNo);
      renderScheduleResult(offlineData, true);
    } else {
      renderError(resultPanel, "Train schedule not found.");
    }
  });

  // Live Train Status form (Nationwide NTES Tracking)
  const liveForm = document.getElementById("live-form");
  if (liveForm) {
    liveForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const trainNo = document.getElementById("live-train-input").value.trim();
      const dateVal = document.getElementById("live-date-select") ? document.getElementById("live-date-select").value : "today";

      const resultPanel = document.getElementById("live-result");
      showLoader(resultPanel);

      // 1. Try Direct Nationwide Live API (NTES GPS Tracking)
      if (window.LiveRailAPI) {
        try {
          const liveData = await window.LiveRailAPI.getLiveTrainStatus(trainNo, dateVal);
          if (liveData && liveData.stations && liveData.stations.length > 0) {
            renderLiveResult(liveData, false);
            return;
          }
        } catch (liveErr) {
          console.warn("LiveRailAPI live tracking failed, trying backend:", liveErr);
        }
      }

      // 2. Try Backend Server API
      if (API_BASE_URL) {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 3500);
          const response = await fetch(`${API_BASE_URL}/api/trains/live/${encodeURIComponent(trainNo)}?date=${dateVal}`, { signal: controller.signal });
          clearTimeout(timeoutId);
          if (response.ok) {
            const data = await response.json();
            renderLiveResult(data, false);
            return;
          }
        } catch (err) {
          console.warn("Backend live status fetch failed:", err);
        }
      }

      // 3. Fallback to Offline Engine
      if (window.OfflineRailDB) {
        const offlineData = window.OfflineRailDB.getLiveStatus(trainNo);
        renderLiveResult(offlineData, true);
      } else {
        renderError(resultPanel, "Live running data not found.");
      }
    });
  }

  // Set today's date in seat availability input as default
  const dateInput = document.getElementById("seat-date-input");
  if (dateInput) {
    const today = new Date();
    const yyyy = today.getFullYear();
    let mm = today.getMonth() + 1;
    let dd = today.getDate();
    if (mm < 10) mm = '0' + mm;
    if (dd < 10) dd = '0' + dd;
    dateInput.value = `${yyyy}-${mm}-${dd}`;
  }
}

// Helpers for prefills from chips
window.prefillPNR = function(pnr) {
  document.getElementById("pnr-input").value = pnr;
  document.getElementById("pnr-form").dispatchEvent(new Event("submit"));
};

window.fillRoute = function(src, dst) {
  document.getElementById("trains-src-input").value = src;
  document.getElementById("trains-dst-input").value = dst;
  document.getElementById("trains-form").dispatchEvent(new Event("submit"));
};

window.prefillLive = function(trainNo) {
  const input = document.getElementById("live-train-input");
  if (input) {
    input.value = trainNo;
    const form = document.getElementById("live-form");
    if (form) form.dispatchEvent(new Event("submit"));
  }
};

// Loader helpers
function showLoader(panel) {
  panel.classList.remove("hidden");
  panel.innerHTML = `<div class="spinner"></div><p style="text-align:center; color:var(--text-muted); font-size: 15px;">Fetching live details...</p>`;
}

function renderError(panel, msg) {
  panel.innerHTML = `
    <div style="display:flex; align-items:center; gap:8px; color:var(--danger); background:var(--danger-soft); padding:18px; border-radius:14px; border: 1px solid var(--border);">
      <span class="material-icons-round">error</span>
      <span style="font-weight:600;">${msg}</span>
    </div>
  `;
}

// Renderers for Results
function renderPNRResult(data, isOffline) {
  const panel = document.getElementById("pnr-result");
  const isPrepared = data.chart_status === "CHART PREPARED";
  const badgeClass = isPrepared ? "badge-success" : "badge-warning";

  const noticeHtml = isOffline ? `
    <div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:10px; background:rgba(255, 152, 0, 0.12); color:#c46900; border:1px solid rgba(255, 152, 0, 0.35); padding:10px 16px; border-radius:12px; font-size:13px; font-weight:600; margin-bottom:14px;">
      <div style="display:flex; align-items:center; gap:8px;">
        <span class="material-icons-round" style="font-size:20px;">offline_bolt</span>
        <span>Simulated PNR Confirmation in <strong>Instant Cache Mode</strong>.</span>
      </div>
      <a href="https://render.com/deploy?repo=https://github.com/Nikhil1081/Indian-Railways-Passenger-Reservation-Enquiry" target="_blank" style="display:inline-flex; align-items:center; gap:4px; color:#c46900; text-decoration:underline; font-weight:700;">
        <span>Deploy to Render</span>
        <span class="material-icons-round" style="font-size:16px;">open_in_new</span>
      </a>
    </div>
  ` : "";

  let paxHtml = "";
  data.passengers.forEach((p, idx) => {
    paxHtml += `
      <tr>
        <td>Passenger ${idx + 1} (${p.name}, Age ${p.age}, ${p.gender})</td>
        <td><strong style="color: var(--primary);">${p.booking_status}</strong></td>
        <td><strong style="color: var(--success);">${p.current_status}</strong></td>
      </tr>
    `;
  });

  panel.innerHTML = `
    ${noticeHtml}
    <div class="result-header">
      <div>
        <h3 style="font-size: 22px; font-weight:700;">PNR Status: ${data.pnr}</h3>
        <p style="color:var(--text-muted); font-size:14px; margin-top:4px;">Train: <strong>${data.train_no} - ${data.train_name}</strong></p>
      </div>
      <span class="result-badge ${badgeClass}">${data.chart_status}</span>
    </div>
    
    <div class="pnr-ticket-grid">
      <div class="ticket-item"><label>From Station</label><span>${data.from}</span></div>
      <div class="ticket-item"><label>To Station</label><span>${data.to}</span></div>
      <div class="ticket-item"><label>Date of Journey</label><span>${data.date_of_journey}</span></div>
      <div class="ticket-item"><label>Class / Quota</label><span>${data.class} / ${data.quota}</span></div>
    </div>

    <h4 style="font-size:16px; font-weight:700; margin-bottom:12px; margin-top: 12px;">Passenger Berth Stoppage Details</h4>
    <div class="data-table-container">
      <table class="data-table">
        <thead>
          <tr>
            <th>Passenger Details</th>
            <th>Booking Status</th>
            <th>Current Status</th>
          </tr>
        </thead>
        <tbody>
          ${paxHtml}
        </tbody>
      </table>
    </div>
  `;
}

function renderSeatsResult(data, isOffline) {
  const panel = document.getElementById("seats-result");
  
  const noticeHtml = isOffline ? `
    <div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:10px; background:rgba(255, 152, 0, 0.12); color:#c46900; border:1px solid rgba(255, 152, 0, 0.35); padding:10px 16px; border-radius:12px; font-size:13px; font-weight:600; margin-bottom:14px;">
      <div style="display:flex; align-items:center; gap:8px;">
        <span class="material-icons-round" style="font-size:20px;">offline_bolt</span>
        <span>Availability calculated in <strong>Instant Cache Mode</strong>.</span>
      </div>
      <a href="https://render.com/deploy?repo=https://github.com/Nikhil1081/Indian-Railways-Passenger-Reservation-Enquiry" target="_blank" style="display:inline-flex; align-items:center; gap:4px; color:#c46900; text-decoration:underline; font-weight:700;">
        <span>Deploy to Render</span>
        <span class="material-icons-round" style="font-size:16px;">open_in_new</span>
      </a>
    </div>
  ` : "";

  let colHtml = "";
  (data.availability || []).forEach(a => {
    let colClass = "status-green";
    if (a.status.includes("WL")) colClass = "status-red";
    else if (a.status.includes("RAC")) colClass = "status-orange";

    let dateText = a.date;
    try {
      if (a.date && a.date.includes("-")) {
        const d = new Date(a.date);
        dateText = d.toLocaleDateString("en-IN", { day: '2-digit', month: 'short', weekday: 'short' });
      }
    } catch(e) {}

    const probVal = a.confirm_probability !== undefined 
      ? Math.round(a.confirm_probability * 100) 
      : (a.probability !== undefined ? Math.round(a.probability) : 90);

    colHtml += `
      <div class="avail-column">
        <span class="date">${dateText}</span>
        <span class="status ${colClass}">${a.status}</span>
        <span style="font-size:11px; color:var(--text-muted); font-weight:600;">Confirm: ${probVal}%</span>
      </div>
    `;
  });

  // Ticket Fare breakdown rendering
  let fareHtml = "";
  if (data.fare) {
    fareHtml = `
      <div style="background-color: var(--primary-soft); padding: 22px 28px; border-radius: 18px; border: 1px solid var(--border); margin-bottom: 24px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 20px;">
        <div>
          <span style="font-size:11px; text-transform:uppercase; font-weight:700; color:var(--text-muted); letter-spacing:0.8px;">Journey Distance</span>
          <h4 style="font-size:18px; font-weight:700;">${data.fare.distance_km} KM</h4>
        </div>
        <div>
          <span style="font-size:11px; text-transform:uppercase; font-weight:700; color:var(--text-muted); letter-spacing:0.8px;">Base + SF/Reservation</span>
          <h4 style="font-size:18px; font-weight:700;">₹${data.fare.base_fare} + ₹${(data.fare.superfast_fee || 0) + (data.fare.reservation_fee || 0)}</h4>
        </div>
        <div>
          <span style="font-size:11px; text-transform:uppercase; font-weight:700; color:var(--text-muted); letter-spacing:0.8px;">Catering + GST (5%)</span>
          <h4 style="font-size:18px; font-weight:700;">₹${data.fare.catering_fee || 0} + ₹${data.fare.gst || 0}</h4>
        </div>
        <div style="background-color: var(--bg-card); padding: 10px 20px; border-radius: 14px; border: 1px solid var(--border); box-shadow: var(--shadow);">
          <span style="font-size:11px; text-transform:uppercase; font-weight:700; color:var(--primary); letter-spacing:0.8px;">Total Ticket Fare</span>
          <h3 style="font-size:24px; font-weight:800; color:var(--primary);">₹${data.fare.total_fare}</h3>
        </div>
      </div>
    `;
  }

  panel.innerHTML = `
    ${noticeHtml}
    <div class="result-header">
      <div>
        <h3 style="font-size: 22px;">${data.train_name} (${data.train_no})</h3>
        <p style="color:var(--text-muted); font-size:14px; margin-top:4px;">Class: <strong>${data.class_code}</strong> | Quota: <strong>${data.quota}</strong></p>
      </div>
    </div>
    
    ${fareHtml}
    
    <h4 style="font-size:15px; font-weight:700; margin-bottom:12px;">7-Day Seat Availability Calendar</h4>
    <div class="availability-columns">
      ${colHtml}
    </div>
  `;
}

function renderTrainsResult(data, src, dst, isOffline, isNationwideLive) {
  const panel = document.getElementById("trains-result");
  if (!data || data.length === 0) {
    panel.innerHTML = `
      <div style="text-align:center; padding:32px; color:var(--text-muted);">
        <span class="material-icons-round" style="font-size:56px;">train</span>
        <p style="margin-top:12px; font-weight:600; font-size:16px;">No matching routes found between ${src} and ${dst}.</p>
      </div>
    `;
    return;
  }

  let noticeHtml = "";
  if (isNationwideLive) {
    noticeHtml = `
      <div style="display:flex; align-items:center; gap:8px; background:rgba(34, 197, 94, 0.12); color:#15803d; border:1px solid rgba(34, 197, 94, 0.35); padding:10px 16px; border-radius:12px; font-size:13px; font-weight:700; margin-bottom:14px;">
        <span class="material-icons-round" style="font-size:20px; color:#16a34a;">sensors</span>
        <span>Connected to <strong>Nationwide Live Railway Network</strong> (${data.length} real-time trains found).</span>
      </div>
    `;
  } else if (isOffline) {
    noticeHtml = `
      <div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:10px; background:rgba(255, 152, 0, 0.12); color:#c46900; border:1px solid rgba(255, 152, 0, 0.35); padding:10px 16px; border-radius:12px; font-size:13px; font-weight:600; margin-bottom:14px;">
        <div style="display:flex; align-items:center; gap:8px;">
          <span class="material-icons-round" style="font-size:20px;">offline_bolt</span>
          <span>Showing trains via <strong>Instant Cache</strong> (Render cloud backend is inactive or starting up).</span>
        </div>
        <a href="https://render.com/deploy?repo=https://github.com/Nikhil1081/Indian-Railways-Passenger-Reservation-Enquiry" target="_blank" style="display:inline-flex; align-items:center; gap:4px; color:#c46900; text-decoration:underline; font-weight:700;">
          <span>Deploy to Render</span>
          <span class="material-icons-round" style="font-size:16px;">open_in_new</span>
        </a>
      </div>
    `;
  }

  let rowsHtml = "";
  data.forEach(t => {
    const runsOn = Array.isArray(t.runs) ? t.runs.join(", ") : "Daily";
    const routeStr = Array.isArray(t.route) ? t.route.join(" → ") : `${t.from} → ${t.to}`;
    const classes = Array.isArray(t.classes) ? t.classes : ["3A", "2A", "SL"];
    const timingBadge = (t.departure_time && t.arrival_time && t.departure_time !== "--")
      ? `<div style="font-size:13px; color:var(--primary); font-weight:700; margin-top:4px;"><span class="material-icons-round" style="font-size:15px; vertical-align:middle;">schedule</span> Dep: <strong>${t.departure_time}</strong> | Arr: <strong>${t.arrival_time}</strong> (${t.duration || ''})</div>`
      : "";

    rowsHtml += `
      <tr>
        <td><strong>${t.train_no}</strong></td>
        <td>
          <div style="font-weight:700; font-size:16px;">${t.name}</div>
          <div style="font-size:12px; color:var(--text-muted); margin-top:2px;">Route: ${routeStr} (${t.distance_km || 350} km)</div>
          ${timingBadge}
        </td>
        <td><span style="font-size:13px; font-weight:600; color:var(--text-muted);">${runsOn}</span></td>
        <td>${classes.map(c => `<span style="display:inline-block; font-size:10px; font-weight:700; background:var(--primary-soft); color:var(--primary); padding:3px 8px; border-radius:6px; margin-right:4px; margin-bottom:2px;">${c}</span>`).join("")}</td>
        <td>
          <button class="chip-btn" onclick="queryAvailabilityFromSearch('${t.train_no}', '${src}', '${dst}', '${classes[0]}')">Seats & Fare</button>
        </td>
      </tr>
    `;
  });

  panel.innerHTML = `
    ${noticeHtml}
    <div class="result-header">
      <h3 style="font-size: 20px;">Trains: ${src} to ${dst} (${data.length} found)</h3>
    </div>
    <div class="data-table-container">
      <table class="data-table">
        <thead>
          <tr>
            <th>No.</th>
            <th>Train Details & Route</th>
            <th>Runs On</th>
            <th>Classes</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
        </tbody>
      </table>
    </div>
  `;
}

window.queryAvailabilityFromSearch = function(trainNo, src, dst, defaultClass) {
  document.getElementById("seat-train-input").value = trainNo;
  document.getElementById("seat-src-input").value = src;
  document.getElementById("seat-dst-input").value = dst;
  
  if (defaultClass) {
    document.getElementById("seat-class-select").value = defaultClass;
  }
  
  const tabs = document.querySelectorAll(".tab-link");
  tabs.forEach(t => {
    if (t.getAttribute("data-tab") === "seats-tab") t.click();
  });
  document.getElementById("seats-form").dispatchEvent(new Event("submit"));
};

function renderScheduleResult(data, isOffline) {
  const panel = document.getElementById("schedule-result");

  const noticeHtml = isOffline ? `
    <div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:10px; background:rgba(255, 152, 0, 0.12); color:#c46900; border:1px solid rgba(255, 152, 0, 0.35); padding:10px 16px; border-radius:12px; font-size:13px; font-weight:600; margin-bottom:14px;">
      <div style="display:flex; align-items:center; gap:8px;">
        <span class="material-icons-round" style="font-size:20px;">offline_bolt</span>
        <span>Schedule loaded via <strong>Instant Cache Mode</strong>.</span>
      </div>
      <a href="https://render.com/deploy?repo=https://github.com/Nikhil1081/Indian-Railways-Passenger-Reservation-Enquiry" target="_blank" style="display:inline-flex; align-items:center; gap:4px; color:#c46900; text-decoration:underline; font-weight:700;">
        <span>Deploy to Render</span>
        <span class="material-icons-round" style="font-size:16px;">open_in_new</span>
      </a>
    </div>
  ` : "";

  let rowsHtml = "";
  (data.schedule || []).forEach(s => {
    rowsHtml += `
      <tr>
        <td><strong>${s.station_code}</strong></td>
        <td>${s.station_name}</td>
        <td>${s.arrival}</td>
        <td>${s.departure}</td>
        <td>${s.halt_minutes > 0 ? `${s.halt_minutes} mins` : '-'}</td>
        <td>${s.distance_km} km</td>
      </tr>
    `;
  });

  panel.innerHTML = `
    ${noticeHtml}
    <div class="result-header">
      <div>
        <h3 style="font-size: 20px;">Route of ${data.name} (${data.train_no})</h3>
      </div>
    </div>
    <div class="data-table-container">
      <table class="data-table">
        <thead>
          <tr>
            <th>Code</th>
            <th>Station Name</th>
            <th>Arrival</th>
            <th>Departure</th>
            <th>Halt</th>
            <th>Distance</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
        </tbody>
      </table>
    </div>
  `;
}

// 4.1 Live Train Status Renderer
function renderLiveResult(data, isOffline) {
  const panel = document.getElementById("live-result");
  const tr = (key, fallback) => (window.I18N ? window.I18N.t(key, fallback) : fallback);

  const noticeHtml = isOffline ? `
    <div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:10px; background:rgba(255, 152, 0, 0.12); color:#c46900; border:1px solid rgba(255, 152, 0, 0.35); padding:10px 16px; border-radius:12px; font-size:13px; font-weight:600; margin-bottom:14px;">
      <div style="display:flex; align-items:center; gap:8px;">
        <span class="material-icons-round" style="font-size:20px;">offline_bolt</span>
        <span>Simulated Live Route in <strong>Instant Cache Mode</strong>.</span>
      </div>
      <a href="https://render.com/deploy?repo=https://github.com/Nikhil1081/Indian-Railways-Passenger-Reservation-Enquiry" target="_blank" style="display:inline-flex; align-items:center; gap:4px; color:#c46900; text-decoration:underline; font-weight:700;">
        <span>Deploy to Render</span>
        <span class="material-icons-round" style="font-size:16px;">open_in_new</span>
      </a>
    </div>
  ` : "";

  const isTerminated = data.is_terminated;
  const delayMins = data.delay_minutes || 0;
  const isLate = delayMins > 0;
  
  const delayPillClass = isLate ? "delay-pill late" : "delay-pill ontime";
  const delayText = isLate 
    ? `<span class="material-icons-round">schedule</span> ${tr("status_delayed", "Late by")} ${delayMins} ${delayMins > 1 ? "mins" : "min"}`
    : `<span class="material-icons-round">check_circle</span> ${tr("status_on_time", "On Time / Right Time")}`;

  const beaconStatusText = isTerminated
    ? `<span class="material-icons-round">task_alt</span> ${tr("status_terminated", "Journey Completed")}`
    : `<div class="live-beacon-dot"></div> ${data.source === "live" ? "Live NTES Track" : "GPS Live Track"}`;

  const curStnName = data.current_station_name || "En Route";
  const curStnCode = data.current_station_code ? `(${data.current_station_code})` : "";
  
  let timelineRows = "";
  (data.stations || []).forEach((stn, idx) => {
    let rowClass = "timeline-station-row";
    let nodeIcon = idx + 1;
    let stnStatusBadge = "";

    if (stn.is_current) {
      rowClass += " current-stn";
      nodeIcon = `<span class="material-icons-round" style="font-size:24px;">train</span>`;
      stnStatusBadge = `<span style="background:var(--primary); color:#fff; padding:4px 10px; border-radius:12px; font-size:13px; font-weight:800; text-transform:uppercase;">${tr("status_current", "Current")}</span>`;
    } else if (stn.has_departed) {
      rowClass += " passed-stn";
      nodeIcon = `<span class="material-icons-round" style="font-size:22px;">check</span>`;
      stnStatusBadge = `<span style="color:var(--text-muted); font-size:14px; font-weight:600;">${tr("status_departed", "Departed")}</span>`;
    } else if (stn.has_arrived) {
      rowClass += " passed-stn";
      nodeIcon = `<span class="material-icons-round" style="font-size:22px;">check</span>`;
      stnStatusBadge = `<span style="color:#16a34a; font-size:14px; font-weight:700;">${tr("status_arrived", "Arrived")}</span>`;
    } else {
      rowClass += " upcoming-stn";
      stnStatusBadge = `<span style="color:var(--text-muted); font-size:14px;">${tr("status_upcoming", "Upcoming")}</span>`;
    }

    const stnDelay = stn.delay_arrival_mins || stn.delay_departure_mins || 0;
    const stnDelayHtml = stnDelay > 0 
      ? `<span style="color:var(--danger); font-weight:700;">+${stnDelay}m late</span>`
      : `<span style="color:#16a34a; font-weight:700;">RT</span>`;

    timelineRows += `
      <div class="${rowClass}">
        <div class="stn-node-indicator">${nodeIcon}</div>
        <div>
          <div style="display:flex; align-items:center; gap:10px;">
            <strong style="font-size: 20px; color: var(--text-main);">${stn.station_name}</strong>
            <span style="font-weight:700; color:var(--primary); font-size:16px;">(${stn.station_code})</span>
            ${stnStatusBadge}
          </div>
          <div style="font-size: 15px; color: var(--text-muted); margin-top: 4px;">
            ${tr("tbl_distance", "Distance")}: ${stn.distance_km} km ${stn.halt_minutes > 0 ? `| Halt: ${stn.halt_minutes}m` : ''}
          </div>
        </div>
        <div>
          <div style="font-size:13px; color:var(--text-muted);">${tr("tbl_sch_arr", "Sch / Act Arr")}</div>
          <div style="font-size:17px; font-weight:700;">${stn.scheduled_arrival || '--'} <span style="font-weight:400; color:var(--text-muted);">/</span> <span style="color:var(--primary);">${stn.actual_arrival || stn.scheduled_arrival || '--'}</span></div>
        </div>
        <div>
          <div style="font-size:13px; color:var(--text-muted);">${tr("tbl_sch_dep", "Sch / Act Dep")}</div>
          <div style="font-size:17px; font-weight:700;">${stn.scheduled_departure || '--'} <span style="font-weight:400; color:var(--text-muted);">/</span> <span style="color:var(--primary);">${stn.actual_departure || stn.scheduled_departure || '--'}</span></div>
        </div>
        <div style="display:flex; flex-direction:column; align-items:flex-end; gap:6px;">
          <div class="platform-chip" title="Platform">PF ${stn.platform || '-'}</div>
          <div>${stnDelayHtml}</div>
        </div>
      </div>
    `;
  });

  panel.innerHTML = `
    ${noticeHtml}
    <div class="live-status-hero-card">
      <div class="live-status-header">
        <div class="live-train-title">
          <span class="material-icons-round" style="font-size:48px; color:var(--primary);">train</span>
          <div>
            <h3>${data.train_name} (${data.train_no})</h3>
            <span style="font-size:16px; color:var(--text-muted);">${tr("opt_today", "Date")}: ${data.date} | ${data.last_updated}</span>
          </div>
        </div>
        <div style="display:flex; align-items:center; gap:16px; flex-wrap:wrap;">
          <div class="live-badge-beacon">${beaconStatusText}</div>
          <div class="${delayPillClass}">${delayText}</div>
        </div>
      </div>

      <div class="live-current-station-banner">
        <div class="cur-stn-info">
          <h4>${tr("status_current", "Current Station / Location")}</h4>
          <div class="stn-highlight">${curStnName} ${curStnCode}</div>
        </div>
        <div class="delay-indicator-box">
          <div style="text-align:right;">
            <div style="font-size:15px; color:var(--text-muted);">${tr("tbl_delay", "Overall Delay")}</div>
            <div style="font-size:24px; font-weight:800; color:${isLate ? 'var(--danger)' : '#16a34a'};">
              ${isLate ? `${delayMins} mins late` : 'Right Time'}
            </div>
          </div>
        </div>
      </div>

      <div class="live-timeline-wrapper">
        <h4 style="font-size:22px; font-weight:800; color:var(--text-main); margin-bottom:12px; display:flex; align-items:center; gap:10px;">
          <span class="material-icons-round" style="color:var(--primary);">route</span>
          Station Route & Platform Timings
        </h4>
        ${timelineRows}
      </div>
    </div>
  `;
}

// 5. Chatbot System (Gemini-style Panel with Groq Integration)
let chatHistory = [];

function initChatbot() {
  const toggle = document.getElementById("chat-toggle");
  const windowEl = document.getElementById("chat-window");
  const close = document.getElementById("chat-close");
  const sendBtn = document.getElementById("chat-send-btn");
  const input = document.getElementById("chat-input");
  const badge = toggle.querySelector(".chat-badge");

  setTimeout(() => {
    if (windowEl.classList.contains("hidden")) {
      badge.classList.remove("hidden");
    }
  }, 3000);

  toggle.addEventListener("click", () => {
    windowEl.classList.toggle("hidden");
    badge.classList.add("hidden");
    if (!windowEl.classList.contains("hidden")) {
      input.focus();
    }
  });

  close.addEventListener("click", () => {
    windowEl.classList.add("hidden");
  });

  sendBtn.addEventListener("click", () => sendMessage());
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") sendMessage();
  });
}

async function sendMessage() {
  const input = document.getElementById("chat-input");
  const message = input.value.trim();
  if (!message) return;

  input.value = "";
  
  appendChatBubble("user", message);
  chatHistory.push({ role: "user", content: message });
  const assistantBubble = appendChatBubble("assistant", "", true);
  
  try {
    const response = await fetch(`${API_BASE_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: message, history: chatHistory })
    });

    if (!response.ok) throw new Error("Chat connection failed.");
    assistantBubble.querySelector(".typing-dots").remove();
    
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let assistantText = "";
    
    while(true) {
      const { value, done } = await reader.read();
      if (done) break;
      
      const chunk = decoder.decode(value);
      assistantText += chunk;
      
      assistantBubble.querySelector(".msg-content").innerHTML = formatMarkdown(assistantText);
      scrollToBottom();
    }
    
    chatHistory.push({ role: "assistant", content: assistantText });
  } catch (err) {
    console.warn("Server chat endpoint failed. Running lazy client-side fallback responder:", err);
    assistantBubble.querySelector(".typing-dots")?.remove();
    
    const fallbackResponse = generateLocalResponseJS(message);
    
    // Simulate streaming typing effect for the fallback response
    let currentText = "";
    const words = fallbackResponse.split(" ");
    let wordIdx = 0;
    
    function typeWord() {
      if (wordIdx < words.length) {
        currentText += words[wordIdx] + " ";
        assistantBubble.querySelector(".msg-content").innerHTML = formatMarkdown(currentText);
        scrollToBottom();
        wordIdx++;
        setTimeout(typeWord, 40); // 40ms typing delay
      } else {
        chatHistory.push({ role: "assistant", content: fallbackResponse });
      }
    }
    typeWord();
  }
}

function generateLocalResponseJS(message) {
  const msg = message.toLowerCase().trim();
  
  if (msg.includes("pnr")) {
    const pnrMatch = msg.match(/\b\d{10}\b/);
    const pnrNum = pnrMatch ? pnrMatch[0] : "1234567890";
    return `### PNR Status for ${pnrNum} (Client Fallback Mode)\n` +
           `**Train**: 12952 - Mumbai Rajdhani Express\n` +
           `**Date of Journey**: 2026-08-15\n` +
           `**Route**: New Delhi (NDLS) to Mumbai Central (MMCT)\n` +
           `**Chart Status**: CHART PREPARED\n\n` +
           `**Passenger Status details**:\n` +
           `- **Rajesh Kumar**: Booking: CNF / A1 / 12 (Lower) | Current: CNF\n` +
           `- **Sunita Devi**: Booking: CNF / A1 / 14 (Side Lower) | Current: CNF\n\n` +
           `*Note: You are viewing local mock PNR data.*`;
  }
  
  if (msg.includes("tatkal")) {
    return `### Tatkal Booking Guidelines (Client Fallback Mode)\n` +
           `- **Timings**: \n` +
           `  - **AC Classes**: Opens at **10:00 AM** daily for the next day's journey.\n` +
           `  - **Non-AC Classes**: Opens at **11:00 AM** daily for the next day's journey.\n` +
           `- **Refunds**: No refund is granted on the cancellation of confirmed Tatkal tickets.\n` +
           `- **Identity Proof**: One of the passengers must carry a valid original ID card listed during booking.`;
  }
  
  if (msg.includes("refund")) {
    return `### Ticket Cancellation & Refund Rules (Client Fallback Mode)\n` +
           `Refund charges on Confirmed Tickets depend on the time of cancellation:\n` +
           `1. **More than 48 hours** before scheduled departure:\n` +
           `   - **1A / Executive Class**: Rs. 240\n` +
           `   - **2A / First Class**: Rs. 200\n` +
           `   - **3A / CC**: Rs. 180\n` +
           `   - **Sleeper Class (SL)**: Rs. 120\n` +
           `   - **Second Seating (2S)**: Rs. 60\n` +
           `2. **Between 12 hours and 48 hours**: 25% of the total ticket fare.\n` +
           `3. **Between 4 hours and 12 hours**: 50% of the total ticket fare.\n` +
           `4. **Less than 4 hours (or chart preparation)**: **No refund** is allowed on confirmed tickets.`;
  }

  if (msg.includes("train") || msg.includes("schedule") || msg.includes("find") || msg.includes("search") || msg.includes("tirupati")) {
    return `### Train Routes & Schedules (Client Fallback Mode)\n` +
           `I can help you search for trains! The database contains **2,800+ real routes**.\n` +
           `You can search and check schedules directly using the **Find Trains** or **Train Schedule** tabs on the main panel for full route timetables.`;
  }
  
  return `Hello! I am **RailAI** (AskDISHA 2.0). How can I assist you today? You can ask me about:\n` +
         `- checking your ticket status (e.g. "check PNR 1234567890")\n` +
         `- cancellation refund rates ("what are the refund rules?")\n` +
         `- Tatkal ticket booking times ("when does Tatkal open?")\n` +
         `- train routes and station list.`;
}

window.sendQuickChat = function(text) {
  document.getElementById("chat-input").value = text;
  sendMessage();
};

function appendChatBubble(role, text, showLoader = false) {
  const container = document.getElementById("chat-messages");
  const bubble = document.createElement("div");
  bubble.className = `chat-msg ${role}`;
  
  const icon = role === "assistant" ? "smart_toy" : "person";
  const contentHtml = showLoader 
    ? `<div class="typing-dots"><span></span><span></span><span></span></div>` 
    : formatMarkdown(text);
    
  const avatarHtml = role === "assistant" 
    ? `<div class="msg-avatar" style="width: 50px; height: 50px; overflow: hidden; border-radius: 50%; display: flex; align-items: center; justify-content: center; background: transparent; padding: 0; border: none; flex-shrink: 0;">
         <img src="chatbot_logo.png" alt="AskDISHA" style="width: 100%; height: 100%; object-fit: cover;">
       </div>`
    : `<div class="msg-avatar">
         <span class="material-icons-round">${icon}</span>
       </div>`;

  bubble.innerHTML = `
    ${avatarHtml}
    <div class="msg-content">
      ${contentHtml}
    </div>
  `;
  
  container.appendChild(bubble);
  scrollToBottom();
  return bubble;
}

function scrollToBottom() {
  const container = document.getElementById("chat-messages");
  container.scrollTop = container.scrollHeight;
}

function formatMarkdown(text) {
  let html = text;
  html = html.replace(/###\s+(.*?)\n/g, '<h3>$1</h3>');
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/-\s+(.*?)\n/g, '<li>$1</li>');
  html = html.replace(/(<li>.*?<\/li>)/gs, '<ul>$1</ul>');
  html = html.replace(/<\/ul>\s*<ul>/g, '');
  
  html = html.split("\n\n").map(p => {
    if (p.trim().startsWith("<h") || p.trim().startsWith("<ul")) {
      return p;
    }
    return `<p>${p.replace(/\n/g, "<br>")}</p>`;
  }).join("");

  return html;
}

function initLeftMenu() {
  const leftMenu = document.getElementById("left-menu");
  const menuToggleBtn = document.getElementById("menu-toggle-btn");
  const leftComposeBtn = document.getElementById("left-compose-btn");
  const leftMenuItems = document.querySelectorAll(".menu-nav-items .menu-item");

  if (menuToggleBtn && leftMenu) {
    menuToggleBtn.addEventListener("click", () => {
      leftMenu.classList.toggle("expanded");
    });
  }

  if (leftComposeBtn) {
    leftComposeBtn.addEventListener("click", () => {
      const activeTab = document.querySelector(".tab-link.active");
      if (activeTab) {
        const targetId = activeTab.getAttribute("data-tab");
        const inputs = document.querySelectorAll(`#${targetId} input`);
        if (inputs.length > 0) {
          inputs[0].focus();
          inputs[0].scrollIntoView({ behavior: "smooth", block: "center" });
        }
      }
    });
  }

  leftMenuItems.forEach(item => {
    item.addEventListener("click", () => {
      leftMenuItems.forEach(i => i.classList.remove("active"));
      item.classList.add("active");

      const tabName = item.getAttribute("data-tab");
      const actionName = item.getAttribute("data-action");

      if (tabName) {
        const tabLink = document.querySelector(`.tab-link[data-tab="${tabName}-tab"]`);
        if (tabLink) {
          tabLink.click();
          tabLink.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      } else if (actionName === "rules") {
        const rulesCard = document.querySelector(".sidebar-card");
        if (rulesCard) {
          rulesCard.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      } else if (actionName === "chat") {
        const chatToggle = document.getElementById("chat-toggle");
        if (chatToggle) {
          chatToggle.click();
        }
      }
    });
  });

  const mainTabLinks = document.querySelectorAll(".tab-link");
  mainTabLinks.forEach(link => {
    link.addEventListener("click", () => {
      const dataTab = link.getAttribute("data-tab");
      if (dataTab) {
        const simpleName = dataTab.replace("-tab", "");
        leftMenuItems.forEach(item => {
          if (item.getAttribute("data-tab") === simpleName) {
            leftMenuItems.forEach(i => i.classList.remove("active"));
            item.classList.add("active");
          }
        });
      }
    });
  });
}
