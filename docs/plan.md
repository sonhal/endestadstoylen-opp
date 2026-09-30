# Plan: registration for athletes and crew

Status: agreed plan, not built yet. Target: registration open well before the
2027 race (around Easter, provisionally 2027-03-26).

## Decisions

| Topic | Decision |
|---|---|
| Hosting | The whole site moves from GitHub Pages to our own VPS, on the same domain `endestadstøylenopp.no` |
| Backend | One Go service with a SQLite database, reached over HTTP REST under `/api/` |
| Frontend | Stays as today: plain HTML + vanilla JS with `fetch`, no build step |
| Size | Small family race. No participant cap, no waiting list |
| Classes | None. Athletes can optionally give a club ("Klubb") |
| Payment | None |
| Crew | A simple "I want to help" sign-up plus a crew page |
| Start list | Public: name and club |
| Admin | One admin user |
| Results | CSV files as today (`results/README.md`), unchanged |
| Email | Wanted, but not in the first version. See [TODO: email](#todo-email) |

## Architecture

```
                 https://endestadstøylenopp.no
                              │
                        ┌─────▼─────┐   automatic TLS (Let's Encrypt)
                        │   Caddy   │   security headers, rate limiting
                        └──┬─────┬──┘
          /*  (static)     │     │   /api/*  (reverse proxy)
     ┌─────────────────────▼┐   ┌▼──────────────────────┐
     │ /srv/stoylen/web/    │   │ Go service            │
     │ HTML, CSV, assets    │   │ 127.0.0.1:8080 only   │
     └──────────────────────┘   └──────────┬────────────┘
                                           │
                            /var/lib/stoylen/stoylen.db (SQLite, WAL)
                                           │
                               nightly backup → off-site copy
```

Page and API share one origin, so there is no CORS, and the admin session
cookie can be `SameSite=Strict`.

### Repository layout

```
web/        today's static site (index.html, assets/, results/, nyheter/, course/ …)
server/     Go module: cmd/stoylen/, internal/…, migrations/*.sql
deploy/     Caddyfile, stoylen.service (systemd), backup script
docs/       this plan
```

Caddy serves **only** `web/`, so `server/`, `deploy/` and `.git/` are never
reachable over HTTP. The existing pages keep their relative paths inside
`web/`, so they need no changes.

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
  id            INTEGER PRIMARY KEY,
  year          INTEGER NOT NULL UNIQUE,
  date          TEXT NOT NULL,          -- 2027-03-26
  reg_opens_at  TEXT,                   -- ISO-8601, NULL = open
  reg_closes_at TEXT                    -- ISO-8601, NULL = no deadline
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
contact.

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
| `GET /api/admin/export.csv` | admin | Start list as `startnr,navn,klubb,tid` with `tid` empty, ready to become `results/ÅÅÅÅ.csv` |
| `GET /api/health` | public | For uptime monitoring |

The manage link carries the token in a header (`Authorization: Bearer …`),
read by the page from `?t=` in the URL, so it is not logged by Caddy.

## Pages

| Page | Content |
|---|---|
| `pamelding.html` | Form with a choice: "I'm running" / "I want to help". Athletes: name, email, club (optional). Crew: name, email, phone (optional), message (optional). Consent box for being listed publicly. Shows the manage link after sending |
| `startliste.html` | Public start list |
| `mannskap.html` | Crew page: what helping involves, who has signed up, button to sign up |
| `admin.html` | Login, list of athletes and crew, set bib, cancel, export CSV |

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
  `Origin` is not our own domain, and require `Content-Type: application/json`.
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
- **Deploy:**
  - Static files: `git pull` in `/srv/stoylen`. Adding a results or news CSV
    works as today: commit, then pull.
  - Backend: build the binary, copy it over, `systemctl restart stoylen`.
  - Later: a GitHub Actions workflow that does both over SSH.

## Phases

1. **Server and move (October).** Harden the VPS, install Caddy, move the
   static files into `web/`, and deploy from git. Switch DNS from GitHub Pages
   to the VPS. Check that every existing page works, including the IDN domain
   and `www`. Remove `CNAME` and disable GitHub Pages afterwards.
2. **Minimum version (November–December).**
   - Go skeleton, migrations, backups.
   - `POST /api/registrations`, `pamelding.html` for athletes and crew.
   - Admin login, list, CSV export.
3. **Public pages (January).** `startliste.html`, `mannskap.html`, manage
   link (view, change, cancel), privacy note.
4. **Email (when the addresses exist).** See below.
5. **Before registration opens (February).** Test a restore, post a news
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
