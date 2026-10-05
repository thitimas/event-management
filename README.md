# CSTEP / STEP Attendance Scanner

A mobile-friendly QR scanner for recording student attendance at CSTEP/STEP sub-events. Coordinators select today's Eventbrite event and agenda session before scanning. Each scan is verified against Eventbrite and recorded in a PostgreSQL database via n8n.

---

## How It Works

1. On page load the scanner calls an n8n GET webhook, which fetches today's Eventbrite events and their agenda sessions in real time.
2. Only events with agenda sessions that have a service type set in their Eventbrite description are shown.
3. A coordinator selects an event and session and taps **Confirm**. The camera starts right away.
4. Each scan is sent to an n8n POST webhook which:
   - Looks up the student barcode in Eventbrite to verify they checked into the main event
   - Inserts an attendance record into the `activity_attendance` table
   - Returns the student's name to display on screen
5. Each result triggers a short full-screen color flash (green = checked in, yellow = already recorded, red = error) and a vibration on phones that support it (not iOS). If the webhook doesn't answer within 10 seconds, the scanner shows "Request timed out — please scan again" and resumes.

### On-device data

- **"N scanned on this phone"** counts successful check-ins from that phone only, for the current date + event + session. The count is saved in `localStorage` (numbers only). n8n doesn't return totals, so other phones aren't included.
- **Recent Scans** shows the last 5 results (name, status, time). It's kept in memory only and cleared when the event/session changes or the page reloads. Student names are never saved on the device.

The Eventbrite API token never touches the browser — it lives in n8n credentials.

---

## n8n Webhooks

Update both URLs in `script.js` if the n8n instance or workflow IDs change:

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
| `script.js` | Event dropdown, QR scanner, and webhook logic |
