# Travel Photo Journal

A personal travel journal: register, verify your email, and keep photos with a name, location, description, and a short AI summary. The API and the UI are one Next.js app.

**Live demo:** [https://your-demo-url.example](https://your-demo-url.example)

**Test credentials.** None are committed. Register in the app and open the verification link from email. Replace this note with a verified demo account before sharing a live URL.

## Tech stack

Next.js is the full stack in one deployable unit, so the pages and route handlers ship together. Postgres holds the relational data (users, sessions, and photos owned by a user). Drizzle is the type-safe SQL layer on top of that schema. Zod validates input, bcrypt hashes passwords, jose signs access tokens, otplib and qrcode handle TOTP, Cloudinary stores images, OpenRouter writes summaries, and Resend sends verification email. See [ARCHITECTURE.md](ARCHITECTURE.md).

## Features

- Account registration and login
- Email verification before login
- JWT access cookie (15 minutes) and a rotating refresh cookie (7 days)
- TOTP two-factor authentication, including setup and disable
- Photo create, read, update, and delete, scoped to the signed-in user
- AI summary of the description, stored on the photo
- Password policy on register and password change (8–72 characters, lowercase, uppercase, number, and symbol)
- In-memory rate limit of 5 requests per minute per IP on login, 2FA verification, password change, and disabling 2FA

## Local setup

1. Install Node.js 22.
2. Install dependencies: `npm install`
3. Copy `.env.example` to `.env.local` and fill in the values below.
4. Apply migrations: `npm run db:migrate`
5. Start the app: `npm run dev`
6. Open [http://localhost:3000](http://localhost:3000)

## Docker

The runtime image is the Next.js standalone server. It does not include `drizzle-kit`, so migrations stay a host step.

1. Fill in `.env.local`. Set `APP_URL` to `http://localhost:3000` when you open the app on that port.
2. Apply migrations before the first start: `npm run db:migrate`
3. Build and start: `docker compose up --build`
4. Open [http://localhost:3000](http://localhost:3000)

`docker-compose.yml` passes `.env.local` into the `app` service and publishes port 3000.

## Tests

```bash
npm test
```

Vitest covers the auth and photo services with the database and external integrations mocked.

## Environment variables

Copy `.env.example` to `.env.local`. Do not commit `.env.local`.

| Name | Purpose | Where to get it |
| --- | --- | --- |
| `DATABASE_URL` | Neon Postgres connection string | [Neon console](https://console.neon.tech) |
| `JWT_ACCESS_SECRET` | HMAC secret for 15-minute access JWTs and the short-lived 2FA pending token | `openssl rand -base64 32` |
| `JWT_REFRESH_SECRET` | Separate random secret kept in the env schema. Refresh tokens are opaque random values stored as SHA-256 hashes, not JWTs signed with this secret | `openssl rand -base64 32` |
| `CLOUDINARY_CLOUD_NAME` | Cloudinary cloud that stores uploaded photos | [Cloudinary console](https://console.cloudinary.com) |
| `CLOUDINARY_API_KEY` | Cloudinary API key used to sign uploads | Cloudinary console, API Keys |
| `CLOUDINARY_API_SECRET` | Cloudinary API secret used to sign uploads and deletes | Cloudinary console, API Keys |
| `OPENROUTER_API_KEY` | Key for the summary request | [OpenRouter keys](https://openrouter.ai/keys) |
| `OPENROUTER_MODEL` | Chat model for summaries. Defaults to `openrouter/free` when unset | [OpenRouter models](https://openrouter.ai/models) |
| `RESEND_API_KEY` | Key for verification email | [Resend API keys](https://resend.com/api-keys) |
| `RESEND_FROM_EMAIL` | From address on verification email | A sender verified in Resend |
| `TOTP_ENCRYPTION_KEY` | Secret used to encrypt TOTP seeds at rest (AES-256-GCM; the key is SHA-256 of this value) | `openssl rand -base64 32` |
| `APP_URL` | Public origin used in verification links | `http://localhost:3000` locally, or the deployed origin |

## API

Success responses are `{ data }`. Errors are `{ error: { code, message, details? } }`. Unexpected failures return 500. Protected routes read the `access_token` cookie. Login, refresh, logout, password change, and a completed 2FA login set cookies.

| Method | Path | Auth | Description | Status codes |
| --- | --- | --- | --- | --- |
| POST | `/api/auth/register` | No | Create an unverified user and email a 24-hour verification link | 200, 400, 409 |
| POST | `/api/auth/verify-email` | No | Verify the email from the token | 200, 400 |
| POST | `/api/auth/login` | No | Check the password. Sets session cookies, or returns a 5-minute pending token when 2FA is on | 200, 400, 401, 403, 429 |
| POST | `/api/auth/refresh` | Refresh cookie | Rotate the refresh token and issue a new access token | 200, 401 |
| POST | `/api/auth/logout` | Refresh cookie, optional | Revoke the current refresh token and clear cookies | 200 |
| GET | `/api/auth/me` | Yes | Return id, email, whether the email is verified, and whether 2FA is on | 200, 401 |
| POST | `/api/auth/change-password` | Yes | Change the password. Requires a TOTP code when 2FA is on. Revokes every refresh token, then issues a new session | 200, 400, 401, 429 |
| POST | `/api/auth/2fa/setup` | Yes | Start TOTP setup and return a QR code | 200, 401, 409 |
| POST | `/api/auth/2fa/verify` | Yes for setup; pending token for login | Confirm setup, or finish login with the authenticator code | 200, 400, 401, 409, 429 |
| POST | `/api/auth/2fa/disable` | Yes | Turn 2FA off with the current password and a valid code | 200, 400, 401, 429 |
| GET | `/api/photos` | Yes | List the signed-in user's photos, newest first | 200, 401 |
| POST | `/api/photos` | Yes | Upload a JPEG, PNG, or WebP up to 5 MB and summarize the description | 200, 400, 401 |
| GET | `/api/photos/[id]` | Yes | Fetch one owned photo | 200, 401, 404 |
| PUT | `/api/photos/[id]` | Yes | Update name, location, or description. A new description regenerates the summary | 200, 400, 401, 404 |
| DELETE | `/api/photos/[id]` | Yes | Delete the photo row and the stored file | 204, 401, 404 |

## Design decisions

The longer write-up is [ARCHITECTURE.md](ARCHITECTURE.md).

- Email verification tokens and refresh tokens are stored as SHA-256 hashes. The refresh cookie rotates on every use. Reusing a revoked refresh token revokes the rest of that user's active refresh tokens.
- A photo query always includes the signed-in user id. Someone else's photo is a 404, so the response does not reveal that the id exists.
- TOTP secrets are encrypted with AES-256-GCM before they are stored. The database does not hold the raw seed.
- If the summary request fails, the photo is kept with `summary` null. An AI outage does not block the upload.
- Route handlers validate and call a service. Services do not read the request or write the response.

## What I'd improve with more time

- A background job queue for summaries
- A Redis rate limiter shared across instances
- Password reset
- Email change with re-verification
- End-to-end tests with Playwright
- Image thumbnails
- Pagination
- A CI pipeline
