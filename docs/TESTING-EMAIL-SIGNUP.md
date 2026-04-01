# Testing Email Signup Flow

## Quick Solutions for Testing Privy Email Authentication

Since Privy requires real email verification codes, here are practical ways to test the email signup flow:

### Option 1: Temporary Email Services (Recommended for Quick Testing)

These services provide disposable email addresses that receive verification codes:

1. **10minutemail.com** - Simple, no signup needed
2. **Guerrillamail.com** - More features, longer expiration (60 minutes)
3. **Tempmail.com** - Multiple domains available

### Option 2: Gmail Aliases (Best for Repeated Testing)

Gmail ignores everything after a `+` sign — all emails go to your main inbox.

Examples:
- `yourname+test1@gmail.com`
- `yourname+privytest1@gmail.com`
- `yourname+wallet1@gmail.com`

### Option 3: Outlook/Hotmail Aliases

Outlook supports email aliases via Microsoft Account settings.

### Testing Checklist

1. ✅ Email verification code arrives
2. ✅ Code can be entered correctly
3. ✅ Wallet is created after verification
4. ✅ User can proceed through onboarding
5. ✅ Profile creation works
6. ✅ Profile verification works
7. ✅ Token claim works

### Notes

- **Temporary emails expire** — don't use them for accounts you want to keep
- **Gmail aliases are permanent** — great for repeated testing
- **Privy may rate limit** — if you hit rate limits, wait a few minutes or use different email services
- **Check spam folder** — verification codes sometimes end up in spam
