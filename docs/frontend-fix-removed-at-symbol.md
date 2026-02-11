# Fix: Removed @ symbol from user name display

## Changes Made

Updated `/src/App.tsx` line 81:

**Before:**
```tsx
@{user.name}
```

**After:**
```tsx
{user.name || 'User'}
```

The `@` symbol that appeared beside the user's name in the dropdown menu has been removed. The name is now displayed cleanly without the `@` prefix, consistent with the change from `username` to `name`.

## Verification

You can verify this change by:

1. Restarting the frontend dev server
2. Logging in
3. Clicking on the user menu in the top right
4. The dropdown will now show the user's name without the `@` symbol
