# CSTEP Attendance Scanner

A static, mobile-friendly QR code scanner for recording student attendance at CSTEP/STEP events. Hosted on GitHub Pages — no server required.

---

## How It Works

A peer mentor or staff member opens the page, selects the event and participation type, then taps **Start Scanner**. The camera opens, and when a student QR code is scanned, the student's token is sent to an n8n webhook that records the check-in.

---

## Setup

### 1. Update the n8n Webhook URL

Open `script.js` and replace the placeholder on line 12:

```js
const WEBHOOK_URL = "https://YOUR-N8N-DOMAIN/webhook/cstep-attendance-checkin";
```

Change it to your actual n8n webhook URL, e.g.:

```js
const WEBHOOK_URL = "https://n8n.yourdomain.com/webhook/cstep-attendance-checkin";
```

---

### 2. Update Event Names and UUIDs

Events are defined in two places that must stay in sync.

**`index.html`** — the dropdown options:

```html
<option value="Research Presentation Day" data-uuid="evt-uuid-001">Research Presentation Day</option>
<option value="Workshop"                  data-uuid="evt-uuid-002">Workshop</option>
```

Replace `evt-uuid-001`, `evt-uuid-002`, etc. with the real UUIDs from your database or n8n workflow. Add or remove `<option>` lines as needed.

**`script.js`** — the `EVENT_OPTIONS` reference object (used for documentation; the UUID is read from the HTML `data-uuid` attribute at runtime):

```js
const EVENT_OPTIONS = {
  "Research Presentation Day": "evt-uuid-001",
  "Workshop":                  "evt-uuid-002",
  ...
};
```

Keep both files consistent.

---

### 3. Host on GitHub Pages

1. Create a new GitHub repository (e.g., `cstep-scanner`).
2. Push all four files to the `main` branch:
   ```
   index.html
   style.css
   script.js
   README.md
   ```
3. Go to **Settings → Pages** in your GitHub repo.
4. Under **Source**, select `Deploy from a branch`, choose `main`, folder `/ (root)`, and click **Save**.
5. GitHub will publish the site at:
   ```
   https://<your-github-username>.github.io/cstep-scanner/
   ```
6. Share this URL with peer mentors.

> **HTTPS is required** for camera access. GitHub Pages serves over HTTPS by default, so this works out of the box.

---

## How to Use (for Peer Mentors & Staff)

1. **Open the scanner page** on your phone or tablet.
2. **Select the event** from the dropdown (e.g., "Workshop").
3. **Select your role** in the Participation Type dropdown (e.g., "Peer Mentor" if you are the one scanning; select the student's role if you know it).
4. Tap **Start Scanner** — your camera will open.
5. Hold the camera over a student's QR code. The app will automatically detect and scan it.
6. Check the status message:
   - 🟢 **Green** = Check-in successful
   - 🟡 **Yellow** = Student already checked in (duplicate)
   - 🔴 **Red** = Error (unknown token or network issue)
7. After each scan the camera pauses for 3 seconds, then resumes automatically.
8. Tap **Stop Scanner** when you are done.

---

## QR Code Format

The scanner handles two formats:

| Format | Example |
|--------|---------|
| Full URL | `https://cstep.york.cuny.edu/checkin?token=abc123` |
| Token only | `abc123` |

If a URL is scanned, the `token` query parameter is extracted automatically.

---

## Webhook Payload

Each successful scan sends a POST request with this JSON body:

```json
{
  "qr_token": "abc123",
  "event_uuid": "evt-uuid-002",
  "event_name": "Workshop",
  "participation_type": "attended",
  "checkin_method": "qr_scan",
  "checked_in_by": "scanner_page",
  "timestamp": "2025-04-01T14:32:00.000Z"
}
```

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Camera doesn't open | Make sure the page is loaded over HTTPS and camera permission is granted in the browser |
| "Network error" message | Check that the webhook URL in `script.js` is correct and your n8n instance is running |
| QR not detected | Ensure adequate lighting; hold the phone steady about 6–10 inches from the QR code |
| Always shows error | Verify the student's QR token exists in your n8n/database workflow |

---

## Files

| File | Purpose |
|------|---------|
| `index.html` | Page structure and dropdowns |
| `style.css` | Mobile-friendly styles |
| `script.js` | Scanner logic, webhook call, response handling |
| `README.md` | This file |
