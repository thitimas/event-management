/* ============================================
   CSTEP Attendance Scanner — script.js
   ============================================

   HOW THIS CONNECTS TO N8N:
   --------------------------
   When a student QR code is scanned, this page sends a POST request
   to the n8n webhook URL below. n8n receives the data, looks up the
   student, records the attendance, and sends back a response.

   TO UPDATE THE WEBHOOK URL IN THE FUTURE:
   -----------------------------------------
   Find the line below that starts with:
     const WEBHOOK_URL = ...
   Replace the URL string with your new n8n webhook URL.

   ============================================ */


// ---------------------------------------------------------------------------
// CONFIGURATION
// ---------------------------------------------------------------------------

// The n8n webhook URL that receives attendance check-in data.
// Update this if your n8n domain or webhook path ever changes.
const WEBHOOK_URL = "https://cstep-n8n.york.cuny.edu/webhook/cstep-attendance-checkin";

// How long (in milliseconds) to pause scanning after each scan.
// 3000 = 3 seconds. This prevents the same QR from being sent twice.
const SCAN_COOLDOWN_MS = 3000;

// ---------------------------------------------------------------------------
// TEST MODE
// When test mode is ON, the page scans real QR codes but does NOT send
// anything to n8n. Instead it just displays the scanned token so you can
// verify the camera and QR reading work correctly before n8n is ready.
// Toggle it on the page using the checkbox — no code changes needed.
// ---------------------------------------------------------------------------

function isTestMode() {
  return $("testModeToggle").checked;
}

function onTestModeToggle() {
  const indicator = $("testModeIndicator");
  if (isTestMode()) {
    indicator.classList.remove("hidden");
  } else {
    indicator.classList.add("hidden");
  }
}


// ---------------------------------------------------------------------------
// STATE — internal variables, do not edit
// ---------------------------------------------------------------------------
let html5QrCode  = null;  // holds the scanner instance
let isCoolingDown = false; // true while waiting between scans
let cooldownTimer = null;  // reference to the cooldown timeout


// ---------------------------------------------------------------------------
// DOM HELPER
// Shortcut for document.getElementById() — used throughout the code.
// ---------------------------------------------------------------------------
const $ = (id) => document.getElementById(id);


// ---------------------------------------------------------------------------
// STATUS MESSAGE
// Shows a colored message bar below the scanner.
// type can be: "success" (green), "warning" (yellow), "error" (red), "info" (blue)
// ---------------------------------------------------------------------------
function showStatus(message, type) {
  const area = $("statusArea");
  const msg  = $("statusMessage");
  msg.textContent = message;
  msg.className   = `status-message ${type}`;
  area.classList.remove("hidden");
}

function hideStatus() {
  $("statusArea").classList.add("hidden");
}


// ---------------------------------------------------------------------------
// LAST SCAN DETAILS
// Displays a summary of the most recent scan at the bottom of the page.
// ---------------------------------------------------------------------------
function showLastScan({ studentName, token, eventName, participationType, timestamp }) {
  const details = $("lastScanDetails");

  // Helper to build one row of the summary table
  const fmt = (label, value) =>
    `<div class="detail-row">
       <span class="detail-label">${label}</span>
       <span>${value}</span>
     </div>`;

  details.innerHTML =
    fmt("Student:",          studentName || "—") +
    fmt("Token:",            token) +
    fmt("Event:",            eventName) +
    fmt("Type:",             participationType) +
    fmt("Time:",             new Date(timestamp).toLocaleTimeString());

  $("lastScan").classList.remove("hidden");
}


// ---------------------------------------------------------------------------
// TOKEN EXTRACTION
// QR codes may contain a full URL or just a plain token string.
//
// Example URL:   https://cstep.york.cuny.edu/checkin?token=abc123
//   → extracts:  abc123
//
// Example plain: abc123
//   → uses as-is: abc123
// ---------------------------------------------------------------------------
function extractToken(scannedText) {
  scannedText = scannedText.trim();
  try {
    // Try to parse scannedText as a URL
    const url   = new URL(scannedText);
    const token = url.searchParams.get("token");
    if (token) return token; // found a ?token= parameter — use it
  } catch (_) {
    // Not a valid URL — treat the whole string as the token
  }
  return scannedText;
}


// ---------------------------------------------------------------------------
// DROPDOWN READERS
// Read the currently selected event name and participation type.
// ---------------------------------------------------------------------------
function getSelectedEvent() {
  const select = $("eventSelect");
  const option = select.options[select.selectedIndex];
  return option.value; // returns the event name string
}

function getParticipationType() {
  return $("participationSelect").value;
}


// ---------------------------------------------------------------------------
// SCANNER — START
// Initialises the html5-qrcode library and opens the camera.
// ---------------------------------------------------------------------------
function startScanner() {
  const eventName = getSelectedEvent();

  // Don't start if no event is selected
  if (!eventName) {
    showStatus("⚠ Please select an event before scanning.", "warning");
    return;
  }

  hideStatus();
  $("scannerWrapper").classList.remove("hidden");
  $("startBtn").disabled = true;
  $("stopBtn").disabled  = false;

  // Create the scanner instance the first time
  if (!html5QrCode) {
    html5QrCode = new Html5Qrcode("qr-reader");
  }

  // Scanner settings
  const config = {
    fps: 10,                          // frames per second to check for QR codes
    qrbox: { width: 250, height: 250 }, // the green scanning box size
    aspectRatio: 1.0,
    rememberLastUsedCamera: true,
  };

  html5QrCode
    .start(
      { facingMode: "environment" }, // use the rear camera on mobile
      config,
      onScanSuccess,  // called when a QR code is detected
      onScanFailure   // called every frame when no QR is found (normal)
    )
    .catch((err) => {
      showStatus("Camera error: " + err, "error");
      resetScannerUI();
    });
}


// ---------------------------------------------------------------------------
// SCANNER — STOP
// Stops the camera and resets the UI.
// ---------------------------------------------------------------------------
function stopScanner() {
  if (html5QrCode && html5QrCode.isScanning) {
    html5QrCode
      .stop()
      .then(() => resetScannerUI())
      .catch((err) => {
        console.warn("Stop error:", err);
        resetScannerUI();
      });
  } else {
    resetScannerUI();
  }
}

function resetScannerUI() {
  $("scannerWrapper").classList.add("hidden");
  $("startBtn").disabled = false;
  $("stopBtn").disabled  = true;
  if (cooldownTimer) clearTimeout(cooldownTimer);
  isCoolingDown = false;
}


// ---------------------------------------------------------------------------
// ON SCAN SUCCESS
// Called automatically by html5-qrcode when a QR code is detected.
// ---------------------------------------------------------------------------
function onScanSuccess(decodedText) {
  // Ignore scans during the cooldown window (prevents duplicate submissions)
  if (isCoolingDown) return;

  // Immediately pause the scanner so the same code isn't sent twice.
  // pause(false) keeps the video feed live but stops QR detection —
  // this avoids the library's "Scanner paused" freeze overlay.
  isCoolingDown = true;
  if (html5QrCode) {
    try { html5QrCode.pause(false); } catch (_) {}
  }

  // Extract the token from the scanned text (handles both URL and plain formats)
  const token             = extractToken(decodedText);
  const eventName         = getSelectedEvent();
  const participationType = getParticipationType();
  const timestamp         = new Date().toISOString();

  showStatus("Sending check-in data…", "info");

  // ---------------------------------------------------------------------------
  // WEBHOOK PAYLOAD
  // This is the JSON object sent to n8n on every successful scan.
  // Fields:
  //   qr_token           — the student's unique identifier from the QR code
  //   event_name         — the event selected in the dropdown
  //   participation_type — the role selected (attended, presented, etc.)
  //   checkin_method     — always "qr_scan" for this page
  //   timestamp          — the exact time of the scan in ISO 8601 format
  // ---------------------------------------------------------------------------
  const payload = {
    qr_token:           token,
    event_name:         eventName,
    participation_type: participationType,
    checkin_method:     "qr_scan",
    timestamp:          timestamp,
  };

  sendCheckin(payload, token, eventName, participationType, timestamp);
}

// Called every frame when no QR code is visible — this is normal behaviour.
// We suppress the most common noisy message to keep the console clean.
function onScanFailure(error) {
  if (!error.includes("No MultiFormat Readers")) {
    console.debug("QR scan frame:", error);
  }
}


// ---------------------------------------------------------------------------
// SEND TO N8N WEBHOOK (or simulate if test mode is on)
// ---------------------------------------------------------------------------
async function sendCheckin(payload, token, eventName, participationType, timestamp) {
  try {
    let data;

    if (isTestMode()) {
      // TEST MODE: show what was scanned without sending anything to n8n
      showStatus(`🔍 Scanned token: ${payload.qr_token}`, "info");
      showLastScan({
        studentName: "(test mode — not sent to n8n)",
        token: payload.qr_token,
        eventName: payload.event_name,
        participationType: payload.participation_type,
        timestamp: payload.timestamp,
      });
      resumeAfterCooldown();
      return;
    } else {
      // LIVE MODE: send the real POST request to n8n
      const response = await fetch(WEBHOOK_URL, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(payload),
      });

      // Try to parse the JSON response from n8n
      try {
        data = await response.json();
      } catch (_) {
        // n8n returned something that isn't valid JSON
        data = { status: "error", message: "Unexpected response from server." };
      }
    }

    handleWebhookResponse(data, token, eventName, participationType, timestamp);

  } catch (networkErr) {
    // fetch() itself failed — usually means the server is unreachable
    showStatus("❌ Network error: Could not reach the server. Check your connection.", "error");
    resumeAfterCooldown();
  }
}


// ---------------------------------------------------------------------------
// HANDLE N8N RESPONSE
// n8n returns a JSON object with a "status" field.
// We use that to decide which colour message to show.
// ---------------------------------------------------------------------------
function handleWebhookResponse(data, token, eventName, participationType, timestamp) {
  const studentName = data.student_name || "";

  if (data.status === "success") {
    // ✅ Green — check-in recorded successfully
    showStatus(
      `✅ Checked in${studentName ? ": " + studentName : ""}` +
      (data.message ? " — " + data.message : ""),
      "success"
    );
    showLastScan({ studentName, token, eventName, participationType, timestamp });

  } else if (data.status === "duplicate") {
    // ⚠ Yellow — this student already checked in for this event
    showStatus(
      `⚠ Already checked in${studentName ? ": " + studentName : ""}` +
      (data.message ? " — " + data.message : ""),
      "warning"
    );
    showLastScan({ studentName, token, eventName, participationType, timestamp });

  } else {
    // ❌ Red — error (unknown token, server issue, etc.)
    showStatus(
      `❌ Error: ${data.message || "Unknown error. Please try again."}`,
      "error"
    );
  }

  // Resume scanning after the cooldown period
  resumeAfterCooldown();
}


// ---------------------------------------------------------------------------
// COOLDOWN RESUME
// Waits SCAN_COOLDOWN_MS milliseconds, then re-activates the scanner.
// This gives the peer mentor time to see the result before the next scan.
// ---------------------------------------------------------------------------
function resumeAfterCooldown() {
  cooldownTimer = setTimeout(() => {
    isCoolingDown = false;
    // Call resume() directly — isScanning returns false when paused,
    // so we can't use it as a guard here.
    if (html5QrCode) {
      try { html5QrCode.resume(); } catch (_) {}
    }
  }, SCAN_COOLDOWN_MS);
}
