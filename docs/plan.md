# Plan: registration for athletes and crew

Status: agreed plan, not built yet. Written in the old repository; moves to the
new one when it is created. Target: registration open well before the
2027 race (around Easter, provisionally 2027-03-26).

## Decisions

| Topic | Decision |
|---|---|
| Hosting | The whole site moves from GitHub Pages to our own VPS (Debian 13 "trixie"), on the same domain `endestadstøylenopp.no` |
| Repository | A new repository for the new version. This repo keeps serving the old site on GitHub Pages until DNS is switched |
| Deploy | A Claude agent running on the VPS sets up the server and deploys, following `deploy/README.md` in the new repo |
| Backend | One Go service with a SQLite database, reached over HTTP REST under `/api/` |
| Frontend | Stays as today: plain HTML + vanilla JS with `fetch`, no build step |
| Size | Small family race. No participant cap, no waiting list |
| Classes | None. Athletes can optionally give a club ("Klubb") |
| Payment | None |
| Crew | A simple "I want to help" sign-up plus a crew page |
| Start list | Public: name and club |
| T-shirt | Everyone, athletes and crew, picks a T-shirt size when registering |
| Admin | One admin user |
| Results | Still CSV files in the same format (`results/README.md`), but uploaded through the admin page and stored in the database instead of committed to git |
| News | Still `nyheter/nyheter.csv` in git for now (see [Open questions](#open-questions)) |
| Email | Wanted, but not in the first version. See [TODO: email](#todo-email) |

## Architecture

```
                 https://endestadstøylenopp.no
                              │
                        ┌─────▼─────┐   automatic TLS (Let's Encrypt)
                        │   Caddy   │   security headers, rate limiting
                        └──┬─────┬──┘
          /*  (static)     │     │   /api/*, /results/*.csv (proxy)
     ┌─────────────────────▼┐   ┌▼──────────────────────┐
     │ /srv/stoylen/web/    │   │ Go service            │
     │ HTML, news, assets   │   │ 127.0.0.1:8080 only   │
     └──────────────────────┘   └──────────┬────────────┘
                                           │
                            /var/lib/stoylen/stoylen.db (SQLite, WAL)
                                           │
                               nightly backup → off-site copy
```

Page and API share one origin, so there is no CORS, and the admin session
cookie can be `SameSite=Strict`.

### Repository

The new repository starts from this one's history (so `git log`/`blame` on the
pages is kept), then moves the files into the layout below. This repo is left
as it is, so the old site stays up until DNS is switched.

```
web/        today's static site (index.html, assets/, nyheter/, course/ …)
server/     Go module: cmd/stoylen/, internal/…, migrations/*.sql
deploy/     Caddyfile, stoylen.service (systemd), backup script
docs/       this plan
```

Caddy serves **only** `web/`, so `server/`, `deploy/` and `.git/` are never
reachable over HTTP. The existing pages keep their relative paths inside
`web/`, so they need no changes. `CNAME` is not carried over.

## Go service

- Routing: standard library `net/http` (Go 1.22+ method patterns). No framework.
- SQLite driver: `modernc.org/sqlite` (pure Go, no CGO). Build a static binary
  on any machine with `GOOS=linux GOARCH=amd64 go build`.
- Queries: hand-written SQL, always with `?` parameters.
- Migrations: numbered `.sql` files built into the binary with `embed`, applied
  at startup and tracked with `PRAGMA user_version`.
- SQLite settings: `journal_mode=WAL`, `busy_timeout=5000`, `foreign_keys=ON`,
  and a single write connection.
- Config: environment variables from a systemd `EnvironmentFile`
  (`/etc/stoylen/env`, root-owned, mode 0600). No secrets in git.
- Graceful shutdown on SIGTERM. Logging with `log/slog` to stdout (journald).

## Data model

```sql
CREATE TABLE races (
  id                 INTEGER PRIMARY KEY,
  year               INTEGER NOT NULL UNIQUE,
  date               TEXT NOT NULL,     -- 2027-03-26
  reg_opens_at       TEXT,              -- ISO-8601, NULL = open
  reg_closes_at      TEXT,              -- ISO-8601, NULL = no deadline
  tshirt_deadline    TEXT,              -- last day to change size, NULL = none
  -- the columns that today live in results/lop.csv:
  distance_km        REAL,
  climb_m            INTEGER,
  note               TEXT,              -- "merknad"
  results_csv        TEXT,              -- uploaded file, NULL = no results yet
  results_updated_at TEXT
);

CREATE TABLE registrations (
  id                INTEGER PRIMARY KEY,
  race_id           INTEGER NOT NULL REFERENCES races(id),
  role              TEXT NOT NULL CHECK (role IN ('athlete', 'crew')),
  name              TEXT NOT NULL,
  email             TEXT NOT NULL,
  phone             TEXT,
  club              TEXT,               -- athletes, optional ("Klubb")
  message           TEXT,               -- crew: "I can bring coffee", optional
  tshirt_size       TEXT NOT NULL       -- see "T-shirt sizes" below
                    CHECK (tshirt_size IN ('none',
                      'dame-S', 'dame-M', 'dame-L', 'dame-XL', 'dame-XXL',
                      'herre-S', 'herre-M', 'herre-L', 'herre-XL', 'herre-XXL')),
  publish_name      INTEGER NOT NULL DEFAULT 1,
  bib               INTEGER,            -- set by admin
  status            TEXT NOT NULL DEFAULT 'registered'
                    CHECK (status IN ('registered', 'cancelled')),
  manage_token_hash BLOB NOT NULL UNIQUE,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (race_id, bib)
);

CREATE TABLE admin_sessions (
  id_hash    BLOB PRIMARY KEY,
  expires_at TEXT NOT NULL
);
```

We collect only what a family race needs: no birth date, gender or emergency
contact. The T-shirt size is not shown publicly.

### T-shirt sizes

- The field is required, so nobody is forgotten when the order is placed.
  "No T-shirt" (`none`) is one of the choices.
- Separate women's and men's cut, each in S, M, L, XL and XXL. The form
  shows them as "Dame M" / "Herre M". They are stored as one value
  (`dame-M`), which keeps the count per size a plain `GROUP BY`.
- The list of allowed sizes is in one place in the Go code and sent to the
  page by `GET /api/races/current`, so the form and the server can't disagree.
  Changing the list later needs a migration, because of the `CHECK`.
- The admin page shows a count per size (athletes and crew together and
  separately), and it can be downloaded as CSV for the order.
- `races` gets a `tshirt_deadline` column. After that date, participants can
  no longer change their size through the manage link (the admin still can),
  so the order isn't changed after it has been placed.

The results CSV is stored as text in the database, not as a file on disk. That
keeps all data in one file, so one backup covers everything.

## API

| Method and path | Access | Purpose |
|---|---|---|
| `GET /api/races/current` | public | Date and whether registration is open |
| `POST /api/registrations` | public | Register as athlete or crew |
| `GET /api/startlist` | public | Athletes: name, club, bib (only `publish_name = 1`) |
| `GET /api/crew` | public | Crew: names (only `publish_name = 1`) |
| `GET /api/registrations/me` | manage link | View your own registration |
| `PUT /api/registrations/me` | manage link | Change your own registration |
| `DELETE /api/registrations/me` | manage link | Cancel |
| `POST /api/admin/login` / `logout` | admin | Session cookie |
| `GET /api/admin/registrations` | admin | Everything, filterable by role |
| `PATCH /api/admin/registrations/{id}` | admin | Bib, status, fix typos |
| `GET /api/admin/tshirts` | admin | Count per size, athletes and crew; `?format=csv` for download |
| `GET /api/admin/export.csv` | admin | Start list as `startnr,navn,klubb,tid` with `tid` empty, for the timekeeper to fill in |
| `PUT /api/admin/races/{year}` | admin | Create or edit a race: date, registration dates, distance, climb, note |
| `PUT /api/admin/races/{year}/results` | admin | Upload the results CSV (body is the file, `text/csv`) |
| `DELETE /api/admin/races/{year}/results` | admin | Remove the results |
| `GET /results/lop.csv` | public | Generated from `races`, same format as today's file |
| `GET /results/{year}.csv` | public | The uploaded file, served back as it was uploaded |
| `GET /api/health` | public | For uptime monitoring |

### Results upload

The results pages (`resultater.html`, `lop.html`, the front page) and
`assets/results.js` stay unchanged. They still fetch `results/lop.csv` and
`results/ÅÅÅÅ.csv`. Caddy sends those two paths to the Go service, which
builds them from the database.

The workflow for the timekeeper:

1. Download the start list from the admin page (`export.csv`).
2. Fill in `tid` in Excel and save as "CSV UTF-8".
3. Upload it on the admin page. The page parses it in the browser with the
   same code as the results pages (`results.js`) and shows a preview: number
   of rows, the winner, and any rows it could not read.
4. Press "Publish". The server checks it again and stores it. Uploading again
   replaces the file.

Server-side checks on upload:
- Size limit 1 MB.
- Must be valid UTF-8. If it isn't, show a clear error: "save as CSV UTF-8 in
  Excel". Strip any BOM.
- The header must contain a name column (`navn`/`name`/`deltaker`).
- At least one data row.

The 2026 results are imported into the database once, with a command-line
subcommand (`stoylen import-results 2026 results/2026.csv`), when the server
is set up.

The manage link carries the token in a header (`Authorization: Bearer …`),
read by the page from `?t=` in the URL, so it is not logged by Caddy.

## Pages

| Page | Content |
|---|---|
| `pamelding.html` | Form with a choice: "I'm running" / "I want to help". Athletes: name, email, club (optional), T-shirt size. Crew: name, email, phone (optional), message (optional), T-shirt size. Consent box for being listed publicly. Shows the manage link after sending |
| `startliste.html` | Public start list |
| `mannskap.html` | Crew page: what helping involves, who has signed up, button to sign up |
| `admin.html` | Login, list of athletes and crew, set bib, cancel, T-shirt count per size, export start list, edit race details (including T-shirt deadline), upload results CSV with preview |

The front page gets a "Meld deg på" button and a link to the crew page in the
menu. All user-supplied text is inserted with `esc()` / `textContent`, as the
results pages already do.

## Security

- **Participants have no accounts.** On registration the server creates a
  random 32-byte token, stores only its SHA-256 hash, and gives the
  participant a manage link. Until email exists, the link is shown once on
  screen with a "save this link" note. The admin can fix anything by hand.
- **Admin.** One user. The password hash (argon2id) lives in the
  `EnvironmentFile`. Sessions are server-side, the cookie is
  `HttpOnly; Secure; SameSite=Strict; Path=/api/admin`, and expires after
  12 hours. Failed logins are rate-limited.
- **CSRF.** Besides `SameSite=Strict`, reject any non-GET request whose
  `Origin` is not our own domain, and require `Content-Type: application/json`
  (`text/csv` for the results upload only).
- **Uploaded CSV.** It is stored and served as data only, never run or
  inserted as HTML. It is served with `Content-Type: text/csv; charset=utf-8`
  and `X-Content-Type-Options: nosniff`, and the pages insert its contents
  with `esc()` as today.
- **Public form abuse.** Rate limit per IP, a hidden honeypot field, request
  bodies capped with `http.MaxBytesReader` (16 KB), and server-side validation
  of every field (length, email format, allowed values).
- **Headers (Caddy).** A strict `Content-Security-Policy` (the inline scripts
  in today's pages need moving to files or hashes first),
  `X-Content-Type-Options: nosniff`, `Referrer-Policy: same-origin`, HSTS.
- **VPS.**
  - SSH with keys only, no root login.
  - `ufw` with only ports 22, 80 and 443 open.
  - `unattended-upgrades`.
  - The Go service listens on `127.0.0.1` only.
  - systemd sandboxing: `DynamicUser=yes`, `StateDirectory=stoylen`,
    `ProtectSystem=strict`, `ProtectHome=yes`, `NoNewPrivileges=yes`,
    `PrivateTmp=yes`.

## Privacy

- A short privacy note on `pamelding.html`: who is responsible, what we store
  and why, and how long we keep it.
- A consent box for public listing (`publish_name`).
- After the race: delete email and phone for that year (a small admin action
  or script). Keep name, club and time, which end up in the results CSV.

## Operations

- **Backup:** a nightly systemd timer runs
  `sqlite3 stoylen.db ".backup …/stoylen-$(date +%F).db"`, keeps 30 days
  locally, and copies them off the server (`restic` or `rclone`).
  **Test a restore before registration opens.**
- **Monitoring:** logs in journald, and an external uptime check on
  `/api/health`.
- **Deploy:** done by a Claude agent on the VPS, following
  `deploy/README.md` in the new repo. That file is written as step-by-step
  instructions with a check after each step, so it can be followed by an
  agent or by hand.
  - Static files: `git pull` in `/srv/stoylen`. Caddy serves `web/` directly.
  - Backend: `go build` on the VPS (Go from Debian 13 or go.dev), then
    `systemctl restart stoylen`.
  - Caddy: from Debian 13 or Caddy's own apt repository. Whoever sets up the
    server checks which version is current. Make sure `unattended-upgrades`
    also covers Caddy's repository if that is used.
  - Results and news no longer need a deploy: results are uploaded on the
    admin page, and news is a `git pull` away.

## Phases

1. **New repository (October).** Create the repo from this one's history,
   move the static files into `web/`, and remove `CNAME`. Write
   `deploy/README.md`, `deploy/Caddyfile` and the systemd units.
2. **Backend and admin (November–December).**
   - Go skeleton, migrations, backups.
   - Races and results in the database. `/results/*.csv` served from the
     database. Admin page for race details and results upload.
     Import of the 2026 results.
   - `POST /api/registrations`, `pamelding.html` for athletes and crew.
   - Admin login, list, start list export.
3. **Public pages (January).** `startliste.html`, `mannskap.html`, manage
   link (view, change, cancel), privacy note.
4. **Server setup and switch (January).**
   - The agent on the VPS sets up the server from `deploy/README.md`
     (hardening, Caddy, service, backups).
   - Test it before switching DNS: point your own machine at the VPS in
     `/etc/hosts`, with a temporary `tls internal` certificate, and check
     every page.
   - Lower the DNS TTL a day before. Switch the `A`/`AAAA` records for the
     domain and `www` from GitHub Pages to the VPS. Caddy then gets a real
     certificate by itself.
   - Once it works, disable GitHub Pages in the old repo and archive it.
5. **Email (when the addresses exist).** See below.
6. **Before registration opens (February).** Test a restore, post a news
   item, open registration.

## TODO: email

Not built in the first version. To do:

- [ ] Create addresses on the domain, e.g. `pamelding@endestadstøylenopp.no`
      (sender) and `post@endestadstøylenopp.no` (replies and contact).
- [ ] Choose how to send: SMTP from the domain's mail host, or a transactional
      provider (Postmark, Mailgun, …).
- [ ] Set up SPF, DKIM and DMARC for the domain, so the mail doesn't land in
      spam.
- [ ] Use the punycode form of the domain in the envelope and headers
      (`pamelding@xn--endestadstylenopp-90b.no`). Not every mail server
      supports non-ASCII domains (SMTPUTF8).
- [ ] Send a confirmation email with the manage link on registration, and a
      "resend my link" function that looks up by email.
- [ ] Optional: notify the admin of new registrations.

Until then, the manage link is only shown on screen once, and the admin fixes
changes by hand.

## Open questions

- Name of the new repository, and whether it should be private. Private
  works fine now that GitHub Pages is no longer used. The VPS then needs a
  read-only deploy key to `git pull`.
- T-shirt: is the shirt free, and is there a usual deadline for the order?
- Should news also be managed on the admin page later, instead of through
  `nyheter.csv` in git?
