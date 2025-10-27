# ZKsync SSO Setup Guide

## Quick Start

### 1. Run with HTTPS (Required for ZKsync SSO)

```bash
npm run dev:https
```

This will start the development server at: **`https://localhost:3000`**

### 2. Accept Self-Signed Certificate

When you first visit `https://localhost:3000`:

1. You'll see a security warning
2. Click "Advanced"
3. Click "Proceed to localhost (unsafe)"

This is normal for local development with self-signed certificates.

---

## Authorize Domain in ZKsync Portal

**⚠️ REQUIRED STEP** - ZKsync SSO will not work until you complete this:

### Steps to Authorize:

1. **Visit:** https://portal.zksync.io/
2. **Connect your wallet** (MetaMask, WalletConnect, etc.)
3. **Navigate to** the "SSO" or "Applications" section
4. **Add/Authorize** the domain: `https://localhost:3000`
5. **Save** the authorization
6. **Return to your app** and refresh the page

### Common Errors:

#### `Error: The source https://localhost:3000/ has not been authorized yet`

- **Cause:** Domain not authorized in ZKsync portal
- **Fix:** Follow the authorization steps above

#### Mixed Content Errors

- **Cause:** Running on HTTP instead of HTTPS
- **Fix:** Use `npm run dev:https` instead of `npm run dev`

---

## Development Scripts

| Script              | URL                      | Use Case                            |
| ------------------- | ------------------------ | ----------------------------------- |
| `npm run dev`       | `http://localhost:3000`  | Regular development (no ZKsync SSO) |
| `npm run dev:https` | `https://localhost:3000` | Development with ZKsync SSO         |

---

## How ZKsync SSO Works

1. **HTTPS Required:** ZKsync SSO requires HTTPS for passkey security
2. **Domain Authorization:** Each domain must be authorized in the ZKsync portal
3. **Passkeys:** Authentication uses WebAuthn passkeys (fingerprint, Face ID, etc.)
4. **Session-Based:** Once authorized, sessions last up to 7 days

---

## Troubleshooting

### Can't Create New Sessions?

**Check these in order:**

1. ✅ **Running on HTTPS?**

   ```bash
   # Should show https://localhost:3000
   npm run dev:https
   ```

2. ✅ **Domain Authorized?**

   - Visit: https://portal.zksync.io/
   - Verify `https://localhost:3000` is in the authorized list

3. ✅ **Old Passkeys Cleared?**

   - Open Chrome Settings → Privacy → Manage Passkeys
   - Delete old ZKsync SSO passkeys
   - Try creating a new session

4. ✅ **Browser Storage Cleared?**
   - Open DevTools (F12)
   - Application tab → Clear Site Data
   - Refresh page

### Still Having Issues?

Check the browser console (F12) for detailed error messages. The error handler provides step-by-step instructions for common issues.

---

## Alternative: Use ngrok for Public HTTPS

If ZKsync portal doesn't support localhost authorization:

```bash
# Install ngrok
npm install -g ngrok

# Start your app
npm run dev:https

# In another terminal, create tunnel
ngrok http https://localhost:3000

# Use the ngrok HTTPS URL (e.g., https://abc123.ngrok.io)
```

Then authorize the ngrok URL in the ZKsync portal instead of localhost.

---

## Production Deployment

For production, ensure:

- ✅ Valid SSL certificate (not self-signed)
- ✅ Domain authorized in ZKsync portal
- ✅ HTTPS enforced for all routes
- ✅ Proper CORS configuration

---

## Additional Resources

- [ZKsync SSO Documentation](https://docs.zksync.io/zksync-network/unique-features/zksync-sso)
- [ZKsync Portal](https://portal.zksync.io/)
- [WebAuthn Guide](https://webauthn.guide/)
