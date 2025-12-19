# Alternative: Browser-Only Storage (No API Needed)

## Current Architecture (Why API is Needed)

- **Frontend**: React component in browser
- **Database**: SQLite file on server filesystem
- **Problem**: Browser can't access filesystem
- **Solution**: API routes bridge browser → server → database

## Alternative: Browser Storage

Since you want it local-only, you could use:

### Option 1: IndexedDB (Browser Database)

- No API routes needed
- Works entirely in browser
- Proper database with queries
- Persists across sessions
- **Limitation**: Only accessible in that browser

### Option 2: localStorage (Simple Key-Value)

- No API routes needed
- Works entirely in browser
- Simple storage
- **Limitation**: Only strings, no queries

### Option 3: Keep Current (Server-Side SQLite)

- API routes needed (browser → server)
- Database on server filesystem
- Can be accessed by server processes
- **Benefit**: Can be shared/backed up

## Recommendation

**If truly local-only**: Use IndexedDB

- Remove all API routes
- Store whitelist in browser IndexedDB
- No server needed
- Simpler architecture

**If you want server-side**: Fix the current setup

- Keep API routes
- Fix database initialization
- More complex but more flexible

Which do you prefer?
