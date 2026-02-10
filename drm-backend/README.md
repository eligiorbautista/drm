# DRM Backend — CastLabs DRMtoday Callback Server

Express.js backend for handling CastLabs DRMtoday license delivery authorization via **Callback Authorization** and **Token Authorization (UAT)**, with complete user authentication, audit logging, and settings management.

## 📚 Documentation

- **[QUICK_REFERENCE.md](QUICK_REFERENCE.md)** ⭐ - **Start here!** All commands, setup steps, and important info in one place
- **[SETUP_GUIDE.md](SETUP_GUIDE.md)** - Detailed setup instructions with Neon PostgreSQL configuration
- **This README** - Project overview and API documentation
- **[COOKIE_AUTH_GUIDE.md](../COOKIE_AUTH_GUIDE.md)** - Cookie-based authentication implementation guide

## Quick Start

```bash
# Install dependencies
npm install

# Copy and configure environment variables
cp .env.example .env
# Edit .env with your DRMtoday merchant ID, shared secret, etc.

# Start development server (with nodemon auto-reload)
npm run dev

# Or start production server
npm start
```

## Project Structure

```
drm-backend/
├── .env.example          # Environment variable template
├── .gitignore
├── nodemon.json          # Nodemon configuration
├── package.json
├── README.md
└── src/
    ├── index.js          # Express app entry point
    ├── config/
    │   └── env.js        # Environment config & validation
    ├── middleware/
    │   ├── errorHandler.js    # Global error & 404 handlers
    │   ├── logger.js          # Winston logger
    │   └── validateCallback.js # DRMtoday callback validation
    ├── routes/
    │   ├── callback.js   # POST /api/callback — DRMtoday callback endpoint
    │   ├── health.js     # GET  /health — Health check
    │   └── token.js      # POST /api/token/generate — UAT generation
    ├── services/
    │   ├── crtService.js     # Customer Rights Token builder
    │   └── tokenService.js   # JWT / UAT generation & verification
    └── utils/
        └── constants.js  # DRM schemes, URLs, security levels
```

## API Endpoints

### `GET /health`
Health check endpoint.

### `POST /api/callback`
**DRMtoday Callback Authorization** — DRMtoday sends license request details here and expects a Customer Rights Token (CRT) in response. This is the URL you configure in the DRMtoday dashboard under "Callback Authorization".

**Incoming payload from DRMtoday:**
```json
{
  "asset": "my-asset-id",
  "user": "user-123",
  "session": "session-abc",
  "client": "client-xyz",
  "drmScheme": "widevine",
  "clientInfo": {
    "manufacturer": "Google",
    "model": "Chrome",
    "version": "120",
    "drmVersion": "16.0.0",
    "secLevel": 1
  }
}
```

**Response:** CRT JSON (purchase license by default).

### `POST /api/callback/rental`
Same as above but returns a rental CRT with time-limited license.

### `POST /api/token/generate`
Generate an Upfront Authorization Token (UAT) for the client to include in the `x-dt-auth-token` header.

**Request body:**
```json
{
  "assetId": "my-asset-id",
  "userId": "user-123",
  "licenseType": "purchase"
}
```

**Response:**
```json
{
  "token": "eyJhbGciOi...",
  "expiresIn": 3600,
  "merchant": "your-merchant-id"
}
```

---

## New Features: Authentication, Audit Logging, and Settings

This backend now includes comprehensive user authentication, audit logging, and settings management powered by PostgreSQL (Neon) and Prisma ORM.

### Authentication

- User registration and login with JWT tokens
- Session management with refresh tokens
- Password hashing with bcrypt
- Role-based access control (USER, ADMIN, SUPER_ADMIN)
- Multi-device session tracking

### Audit Logging

- Complete audit trail of all system actions
- Tracks DRM callbacks, license requests, and user activities
- Filterable by action, user, entity type, and date range
- Statistics and reporting capabilities

### Settings Management

- Persistent application configuration
- User-specific setting overrides
- Organized by category (drm, stream, authentication)
- Support for multiple value types (string, number, boolean, JSON)
- Default settings with initialization

### Database Setup

See [SETUP_GUIDE.md](SETUP_GUIDE.md) for complete setup instructions including:

1. Creating a Neon PostgreSQL database
2. Configuring environment variables
3. Running database migrations
4. Seeding with default data
5. API usage examples

### New API Endpoints

**Authentication:**
- `POST /api/auth/register` - Register a new user
- `POST /api/auth/login` - Login and get tokens
- `POST /api/auth/logout` - Logout from current device
- `POST /api/auth/logout-all` - Logout from all devices
- `GET /api/auth/me` - Get current user info
- `POST /api/auth/refresh` - Refresh access token
- `PUT /api/auth/password` - Update password
- `GET /api/auth/sessions` - List active sessions
- `DELETE /api/auth/sessions/:id` - Revoke a session

**Audit Logs (Admin):**
- `GET /api/audit/logs` - Get all audit logs with pagination and filters
- `GET /api/audit/logs/:id` - Get a specific audit log
- `GET /api/audit/actions` - List available audit actions
- `GET /api/audit/stats` - Get audit statistics
- `GET /api/audit/user/:userId` - Get logs for a specific user
- `GET /api/audit/entity/:type/:id` - Get logs for a specific entity

**Settings:**
- `GET /api/settings` - Get user settings
- `GET /api/settings/public` - Get public settings (no auth)
- `GET /api/settings/:key` - Get a specific setting
- `GET /api/settings/category/:category` - Get settings by category
- `PUT /api/settings/:key` - Update a setting
- `POST /api/settings` - Update multiple settings
- `DELETE /api/settings/:key` - Delete/reset a setting
- `POST /api/settings/:key/reset` - Reset to default value

### Database Models

- **User** - User accounts with roles and authentication
- **Session** - JWT sessions with device tracking
- **AuditLog** - Complete audit trail
- **Setting** - Application configuration
- **LicenseRequest** - DRM license request tracking

### Default Credentials

After running the seed script:
- Admin: `admin@drmmedia.com` / `admin123`
- User: `user@drmmedia.com` / `password123`

[WARNING] **Change these passwords in production!**

### `POST /api/token/verify`
Verify and decode a UAT token (for debugging).

## Configuration

All configuration is done via environment variables (`.env` file):

| Variable | Description | Default |
|---|---|---|
| `PORT` | Server port | `3000` |
| `NODE_ENV` | Environment | `development` |
| `DRMTODAY_MERCHANT` | CastLabs merchant ID | *required* |
| `DRMTODAY_ENVIRONMENT` | `staging` or `production` | `staging` |
| `DRM_JWT_SHARED_SECRET` | Hex-encoded shared secret | *required* |
| `DRM_JWT_ALGORITHM` | `HS256`, `HS384`, or `HS512` | `HS256` |
| `DRM_JWT_TOKEN_EXPIRY` | Token TTL in seconds | `3600` |
| `DEFAULT_ASSET_ID` | Default asset ID | `default-asset` |
| `CALLBACK_AUTH_SECRET` | Verify incoming callbacks | *(empty)* |
| `CORS_ALLOWED_ORIGINS` | Comma-separated origins | `http://localhost:3000` |
| `LOG_LEVEL` | `error`, `warn`, `info`, `debug` | `info` |

## DRMtoday Dashboard Setup

1. Go to **License Delivery Authorization** in the DRMtoday dashboard
2. Select **Callback Authorization**
3. Set the callback URL to `https://your-server.com/api/callback`
4. For **Token Authorization**: add the shared secret under "Upfront token authorization"
