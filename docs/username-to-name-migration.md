# Changes Made: Username → Name Migration

## Summary
Replaced the `username` field with `name` in both backend and frontend. The `name` field is now optional and users log in using their email address.

---

## Backend Changes (drm-backend)

### Prisma Schema (`prisma/schema.prisma`)
- Removed `username String @unique` from User model
- Added `name String?` (optional, not unique)
- Removed `@@index([username])` from User model

### Database Migration
- Created new migration: `20260211024300_replace_username_with_name`
- Dropped `username` column from `users` table
- Added `name` column (optional TEXT)

### Service Files
- `src/services/userService.js` - All occurrences of `username` replaced with `name`
- `prisma/seed.js` - Updated to use `name` instead of `username`

### API Endpoints
- Login requires email and password only
- Registration includes `name` (optional)
- UserProfile updates accept `name` instead of `username`

---

## Frontend Changes (drm-frontend)

### Type Definitions (`src/lib/api.ts`)
```typescript
export interface User {
  id: string;
  email: string;
  name?: string;  // Changed from username: string
  role: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}
```

### API Methods
- `register(data: { email: string; name: string; password: string })`
- `updateProfile(data: { name?: string })`

### Components
- `src/components/Auth.tsx` - Updated registration form
  - Field label: "Username" → "Name"
  - Placeholder: "johndoe123" → "John Doe"
  - Removed username unique validation
- `src/context/AuthContext.tsx` - Updated User interface to have optional `name`
- `src/App.tsx` - Already using `name` correctly

---

## Database Schema

### Before
```sql
CREATE TABLE "users" (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  username TEXT UNIQUE NOT NULL,
  passwordHash TEXT NOT NULL,
  -- ...
);
```

### After
```sql
CREATE TABLE "users" (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT,  -- Optional, not unique
  passwordHash TEXT NOT NULL,
  -- ...
);
```

---

## Seeded Users
| Email             | Name   | Password    |
|-------------------|--------|-------------|
| admin@sb2024.live | admin  | pwq123456   |
| user1@sb2024.live | user1  | pwq123456   |
| user2@sb2024.live | user2  | pwq123456   |
| user3@sb2024.live | user3  | pwq123456   |
| user4@sb2024.live | user4  | pwq123456   |
| user5@sb2024.live | user5  | pwq123456   |
| user6@sb2024.live | user6  | pwq123456   |

---

## Testing

### Backend API Login Response
```json
{
  "message": "Login successful",
  "user": {
    "id": "...",
    "email": "admin@sb2024.live",
    "name": "admin",
    "role": "admin"
  },
  "token": "...",
  "refreshToken": "..."
}
```

---

## Production Deployment Notes

To update the production database on Render:

1. Run migration via Render Console:
   ```bash
   cd /opt/render/project/src/drm-backend
   npx prisma migrate deploy
   ```

2. Or use db push (recommended):
   ```bash
   npx prisma db push --accept-data-loss
   ```

⚠️ **Warning**: This will drop the `username` column and lose any existing username data.
