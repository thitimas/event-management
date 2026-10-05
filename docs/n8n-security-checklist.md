# n8n Security Checklist

The scanner page is public and both webhook URLs are in this (public) repo, so the
real protection has to live in n8n. The app sends the staff passcode in an
`X-Scanner-Key` header; these steps make n8n check it and harden the workflows.

## 1. Rollout order (do this in order)

1. **Deploy the app first.** It already sends `X-Scanner-Key`; n8n ignores the
   header until Header Auth is turned on, so nothing breaks.
2. Confirm staff devices have loaded the new version (`?v=11`) and entered the passcode.
3. **Then enable Header Auth** on both webhooks (step 2 below).

If Header Auth is enabled before the app is deployed, every request returns 403 and
scanning stops.

## 2. Header Auth on both webhooks

- [ ] In n8n, create a credential: **Header Auth** — Name: `X-Scanner-Key`, Value: the staff passcode.
- [ ] Attach it to **both** Webhook nodes (the events GET and the scan POST):
      Webhook node → Authentication → **Header Auth** → select the credential.
- [ ] To rotate the passcode, edit the credential's value. Staff devices get a 401/403,
      the app clears the old passcode and asks for the new one.

## 3. CORS

- [ ] On both Webhook nodes set **Options → Allowed Origins (CORS)** to the site origin
      only (e.g. `https://thitimas.github.io`), not `*`.
- [ ] The custom header makes the browser send a preflight `OPTIONS` request, including
      for the events GET. If the browser console shows CORS errors after deploying,
      check that the n8n version supports Allowed Origins and answers preflight requests
      with `Access-Control-Allow-Headers` that include `X-Scanner-Key`.

## 4. Don't trust client fields

The browser sends `event_id`, `event_name`, `event_date`, `agenda_title` and `qr_token`.
Anyone can change these.

- [ ] Derive `event_name` and `event_date` from `event_id` on the server
      (Eventbrite / database), not from the request body.
- [ ] Verify the session (`event_id` + `agenda_title`) exists in the `activities` table
      before inserting attendance; reject it otherwise.
- [ ] In the Postgres node, use **query parameters** (`$1`, `$2`, … with the
      "Query Parameters" option). Never string-concatenate `qr_token`, `agenda_title`
      or any other request field into SQL.

## 5. Minimal PII in responses

- [ ] Return only what staff need to confirm the right student, e.g. first name +
      last initial (`Jane D.`). No email, full barcode, or other student data.

## 6. Optional

- [ ] Generate new webhook paths (the current ones are in public git history), then
      update `WEBHOOK_URL` / `EVENTS_TODAY_URL` in `script.js`.
- [ ] Add rate limiting at a reverse proxy in front of n8n to slow down barcode guessing.
