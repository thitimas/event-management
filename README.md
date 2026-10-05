# CSTEP / STEP Attendance Scanner

A mobile-friendly QR scanner for recording student attendance at CSTEP/STEP sub-events. Coordinators select today's Eventbrite event and agenda session before scanning. Each scan is verified against Eventbrite and recorded in a PostgreSQL database via n8n.

---

## How It Works

1. On page load the scanner calls an n8n GET webhook, which fetches today's Eventbrite events and their agenda sessions in real time.
2. Only events with agenda sessions that have a service type set in their Eventbrite description are shown.
3. A coordinator selects an event and session, then starts scanning student QR codes.
4. Each scan is sent to an n8n POST webhook which:
   - Looks up the student barcode in Eventbrite to verify they checked into the main event
   - Inserts an attendance record into the `activity_attendance` table
   - Returns the student's name to display on screen

The Eventbrite API token never touches the browser — it lives in n8n credentials.

---

## Security

### Staff passcode

1. The first time the page is opened on a device, staff enter the **staff passcode** and tap **Save**. It is stored in the browser's `localStorage` on that device.
2. Every request to n8n (the events GET and each scan POST) sends the passcode in an `X-Scanner-Key` header. It is never put in a URL or logged to the console.
3. n8n checks the header with a **Header Auth** credential. If n8n returns **401 or 403** (wrong or rotated passcode), the app clears the saved passcode, stops the scanner, and asks for the current passcode again.
4. **Change passcode / log out** in the footer clears the saved passcode on that device.

To rotate the passcode, edit the Header Auth credential in n8n and give staff the new value.

The n8n side (Header Auth, CORS, rollout order, SQL parameters, PII) is covered in **[docs/n8n-security-checklist.md](docs/n8n-security-checklist.md)**. Deploy the app first, then turn on Header Auth in n8n.

### Content-Security-Policy

`index.html` sets a CSP via `<meta http-equiv>`: scripts only from this site, network requests only to `https://cstep-n8n.york.cuny.edu`. Inline scripts and inline event handlers (`onclick=` etc.) are blocked, so wire up new buttons with `addEventListener` in `script.js`. If the n8n domain changes, update `connect-src` in the CSP as well as the URLs in `script.js`.

### Scanner library

The QR library is self-hosted at `vendor/html5-qrcode.min.js` — **html5-qrcode 2.3.8**, downloaded from `https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js` (SHA-256 `660b12437b1d747e3e68b8be0685c08cb728140110ad213f167b14b66f8b1d8e`). To upgrade, download the new min build to the same path and bump the `?v=` cache-buster.

---

## n8n Webhooks

Both webhooks require the `X-Scanner-Key` header once Header Auth is enabled (see [Security](#security)). Update both URLs in `script.js` if the n8n instance or workflow IDs change:

```js
// Receives each QR scan and records attendance
const WEBHOOK_URL = "https://cstep-n8n.york.cuny.edu/webhook/...";

// Called on page load to fetch today's events and agenda sessions
const EVENTS_TODAY_URL = "https://cstep-n8n.york.cuny.edu/webhook/...";
```

### Scan payload sent to `WEBHOOK_URL`

```json
{
  "qr_token":     "abc123",
  "event_id":     "1992055126508",
  "event_name":   "STEP",
  "event_date":   "2026-06-29",
  "agenda_title": "Research Presentations"
}
```

### Response expected from `WEBHOOK_URL`

```json
{
  "status":       "success | duplicate | error",
  "student_name": "Jane Doe",
  "message":      "Checked in"
}
```

---

## Database Tables

### `activities`
Populated by the fetch workflow when the page loads. One row per event + agenda session combination.

| Column | Type | Notes |
|--------|------|-------|
| `event_id` | TEXT | Eventbrite event ID — part of primary key |
| `activity_name` | TEXT | Agenda session title — part of primary key |
| `activity_type` | TEXT | Service type from Eventbrite session description |
| `activity_date` | DATE | Event date |
| `activity_location` | TEXT | Venue address |

### `activity_attendance`
One row per student check-in.

| Column | Type | Notes |
|--------|------|-------|
| `event_id` | TEXT | FK → activities |
| `activity_name` | TEXT | FK → activities |
| `student_id` | TEXT | Eventbrite attendee barcode |

---

## Eventbrite Setup

- **Activity type** is read from the Eventbrite agenda session's description field. Sessions without a description are excluded from the scanner dropdown.
- Students must be checked into the main event in Eventbrite before the scanner will record their sub-event attendance this is insurance for checking them into main.

---
## Files

| File | Purpose |
|------|---------|
| `index.html` | Scanner setup and page structure |
| `style.css` | Mobile-first styles |
| `script.js` | Passcode, event dropdown, QR scanner, and webhook logic |
| `vendor/html5-qrcode.min.js` | Self-hosted html5-qrcode 2.3.8 |
| `docs/n8n-security-checklist.md` | n8n-side security steps |
