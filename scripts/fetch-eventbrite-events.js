const fs = require("node:fs/promises");

const API_TOKEN = process.env.EVENTBRITE_API_TOKEN;
const ORGANIZER_ID = process.env.EVENTBRITE_ORGANIZER_ID;
const TIME_ZONE = process.env.EVENT_TIME_ZONE || "America/New_York";
const OUTPUT_FILE = "events-today.json";

if (!API_TOKEN) {
  throw new Error("Missing EVENTBRITE_API_TOKEN.");
}

if (!ORGANIZER_ID) {
  throw new Error("Missing EVENTBRITE_ORGANIZER_ID.");
}

function localDateString(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function eventDate(event, key) {
  return event[key]?.utc || event[key]?.local || "";
}

function plainText(value) {
  return String(value || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeEvent(event) {
  return {
    id: String(event.id || ""),
    name: plainText(event.name?.text || event.name?.html || event.name),
    starts_at: eventDate(event, "start"),
  };
}

function happensToday(event, today) {
  const startsAt = eventDate(event, "start");
  const endsAt = eventDate(event, "end") || startsAt;

  if (!startsAt) return false;

  const startDate = localDateString(new Date(startsAt));
  const endDate = localDateString(new Date(endsAt));

  return startDate <= today && endDate >= today;
}

function buildEventsUrl(continuation) {
  const url = new URL(
    `https://www.eventbriteapi.com/v3/organizers/${encodeURIComponent(ORGANIZER_ID)}/events/`
  );

  url.searchParams.set("order_by", "start_asc");
  url.searchParams.set("status", "live");

  if (continuation) {
    url.searchParams.set("continuation", continuation);
  }

  return url;
}

async function fetchEventbriteJson(url) {
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${API_TOKEN}`,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Eventbrite request failed (${response.status}): ${body.slice(0, 500)}`);
  }

  return response.json();
}

async function fetchAllEvents() {
  const events = [];
  let continuation = "";

  for (let page = 0; page < 50; page += 1) {
    const data = await fetchEventbriteJson(buildEventsUrl(continuation));
    events.push(...(Array.isArray(data.events) ? data.events : []));

    const pagination = data.pagination || {};
    if (!pagination.has_more_items || !pagination.continuation) {
      break;
    }

    continuation = pagination.continuation;
  }

  return events;
}

// Each event's agenda lives in an "agenda" widget inside its structured content.
// We flatten every tab's slots into a simple list the scanner can render.
async function fetchEventAgenda(eventId) {
  const url =
    `https://www.eventbriteapi.com/v3/events/${encodeURIComponent(eventId)}/structured_content/?purpose=listing`;

  let data;
  try {
    data = await fetchEventbriteJson(url);
  } catch (err) {
    console.warn(`Could not load agenda for event ${eventId}: ${err.message}`);
    return [];
  }

  const widget = (data.widgets || []).find((w) => w.type === "agenda");
  const tabs = widget?.data?.tabs || [];

  const items = [];

  for (const tab of tabs) {
    for (const slot of tab.slots || []) {
      const title = plainText(slot.title);
      if (!title) continue;

      items.push({
        title,
        start_time: String(slot.startTime || ""),
      });
    }
  }

  return items;
}

async function main() {
  const today = localDateString();
  const rawEvents = await fetchAllEvents();
  const todaysEvents = rawEvents
    .filter((event) => happensToday(event, today))
    .map(normalizeEvent)
    .filter((event) => event.id && event.name)
    .sort((a, b) => String(a.starts_at).localeCompare(String(b.starts_at)));

  // Attach each event's agenda sessions (one extra request per event).
  const events = [];
  for (const event of todaysEvents) {
    const agenda = await fetchEventAgenda(event.id);
    events.push({ ...event, agenda });
  }

  const output = {
    generated_at: new Date().toISOString(),
    date: today,
    timezone: TIME_ZONE,
    events,
  };

  await fs.writeFile(OUTPUT_FILE, `${JSON.stringify(output, null, 2)}\n`);
  const sessionCount = events.reduce((total, event) => total + event.agenda.length, 0);
  console.log(
    `Wrote ${events.length} event(s) with ${sessionCount} agenda session(s) for ${today} to ${OUTPUT_FILE}.`
  );
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
