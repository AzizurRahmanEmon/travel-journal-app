# Architecture: Travel Photo Journal

## Stack

Next.js (App Router, route handlers) + TypeScript, Neon Postgres + Drizzle ORM, Zod, bcryptjs, jose (JWT), otplib + qrcode (TOTP), Cloudinary (images), OpenRouter (AI summary), Resend (email). Deployed on Vercel.
Why: one deployable unit for API + UI, serverless Postgres, typed end to end.

## Folder layout

```
src/
  app/
    api/auth/{register,verify-email,login,refresh,logout,2fa/setup,2fa/verify}/route.ts
    api/photos/route.ts            # GET list, POST create
    api/photos/[id]/route.ts       # GET, PUT, DELETE
    (pages)/ register, login, verify, photos
  db/        schema.ts, client.ts, migrations/
  lib/
    env.ts           # Zod-validated env, only place reading process.env
    errors.ts        # AppError + toResponse()
    handler.ts       # withHandler(): parses, catches, formats responses
    auth/            # jwt.ts, password.ts, guard.ts (requireUser), totp.ts
    validators/      # Zod schemas per feature
    services/        # auth.service.ts, photo.service.ts (business logic)
    integrations/    # mailer.ts, storage.ts, summarizer.ts (swappable adapters)
tests/
```

Route handlers are thin: validate, then call a service, then return the response. Services never touch Request/Response.

## Data model

- users: id (uuid), email (unique, lowercase), password_hash, email_verified_at, totp_secret (encrypted), totp_enabled, created_at
- email_verification_tokens: id, user_id, token_hash, expires_at (24h), used_at
- refresh_tokens: id, user_id, token_hash, expires_at (7d), revoked_at, replaced_by
- photos: id, user_id (FK, indexed), image_url, image_public_id, name, location, description, summary (nullable), created_at, updated_at

All tokens are stored as SHA-256 hashes, so a DB leak exposes no usable tokens.

## Auth flow

1. Register: hash the password (bcrypt, 12), create an unverified user, email a random token link.
2. Verify email: hash the token, match an unexpired unused row, set email_verified_at.
3. Login: check the password, then reject if unverified. If 2FA is on, return a short-lived (5 min) "2fa_pending" token and require /auth/2fa/verify with the code. Otherwise issue tokens.
4. Tokens: access JWT (15 min) + refresh token (7d), both in HttpOnly, Secure, SameSite=Lax cookies.
5. Refresh: rotate on every use. Reusing a revoked token revokes the whole chain (theft detection).
6. 2FA setup: generate a secret, return a QR data URL, and enable only after the first valid code.

## API conventions

- Success: `{ data }`. Error: `{ error: { code, message, details? } }`
- Status codes: 400 invalid, 401 unauthenticated, 403 unverified/2FA, 404 not found, 409 email taken, 429 rate limited, 500
- Generic login error ("Invalid credentials") so it doesn't reveal which emails exist.

## Security

- Every photo query uses `WHERE id = ? AND user_id = ?`. Another user's photo returns 404, which hides that it exists.
- Upload validation: image MIME types only, max 5 MB, re-checked server-side.
- Rate-limit login, register and 2FA endpoints.
- Never log passwords, tokens, or secrets.

## Photo + AI summary

On create: validate, upload to storage, insert the row, generate the summary, then update the row. If the AI call fails, keep the photo with summary = null and log the error, so an AI outage never blocks uploads. Edits to the description regenerate the summary. Delete removes the DB row and the stored file.

## Testing

Vitest unit tests for services (auth, ownership, token rotation) with the integrations mocked.

## Tradeoffs / future work

Summary is generated inline (a job queue would be better at scale), the rate limiter is in-memory (Redis in production), and there's no password reset yet.
