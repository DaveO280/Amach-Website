# Testing Email Signup Flow

## Quick Solutions for Testing Privy Email Authentication

Since Privy requires real email verification codes, here are practical ways to test the email signup flow:

### Option 1: Temporary Email Services (Recommended for Quick Testing)

These services provide disposable email addresses that receive verification codes:

1. **10minutemail.com** - Simple, no signup needed
   - Visit: https://10minutemail.com
   - Copy the email address
   - Use it in Privy signup
   - Check the inbox for verification code

2. **Guerrillamail.com** - More features, longer expiration
   - Visit: https://www.guerrillamail.com
   - Get instant email address
   - Emails last 60 minutes

3. **Tempmail.com** - Multiple domains available
   - Visit: https://tempmail.com
   - Choose a domain
   - Get instant inbox

### Option 2: Gmail Aliases (Best for Repeated Testing)

If you have a Gmail account, you can use aliases to create unlimited test emails:

**How it works:**

- Gmail ignores everything after a `+` sign
- All emails go to your main inbox
- Example: `yourname+test1@gmail.com`, `yourname+test2@gmail.com`, etc.

**Steps:**

1. Use your Gmail address with a `+` suffix:
   - `yourname+test1@gmail.com`
   - `yourname+test2@gmail.com`
   - `yourname+test3@gmail.com`
   - etc.

2. All verification codes will arrive in your main Gmail inbox

3. You can filter them by searching for `+test1`, `+test2`, etc.

**Pro Tip:** Use descriptive aliases:

- `yourname+privytest1@gmail.com`
- `yourname+privytest2@gmail.com`
- `yourname+wallet1@gmail.com`
- `yourname+wallet2@gmail.com`

### Option 3: Outlook/Hotmail Aliases

Outlook also supports aliases:

- Go to Microsoft Account settings
- Add email aliases
- Use them for testing

### Option 4: Create Multiple Gmail Accounts

If you need completely separate accounts:

1. Create a new Gmail account
2. Use it for testing
3. Repeat as needed

### Quick Test Script

Here's a simple way to generate test emails:

```javascript
// In browser console or a helper script
function getTestEmail(index = 1) {
  const baseEmail = "yourname@gmail.com"; // Replace with your email
  const [local, domain] = baseEmail.split("@");
  return `${local}+test${index}@${domain}`;
}

// Usage:
getTestEmail(1); // yourname+test1@gmail.com
getTestEmail(2); // yourname+test2@gmail.com
getTestEmail(3); // yourname+test3@gmail.com
```

### Testing Checklist

When testing the email flow:

1. ✅ Email verification code arrives
2. ✅ Code can be entered correctly
3. ✅ Wallet is created after verification
4. ✅ User can proceed through onboarding
5. ✅ Profile creation works
6. ✅ Profile verification works
7. ✅ Token claim works

### Notes

- **Temporary emails expire** - Don't use them for accounts you want to keep
- **Gmail aliases are permanent** - Great for repeated testing
- **Privy may rate limit** - If you hit rate limits, wait a few minutes or use different email services
- **Check spam folder** - Sometimes verification codes end up in spam

### Troubleshooting

**Issue:** Verification code not arriving

- Check spam folder
- Wait 30-60 seconds (email delivery can be delayed)
- Try a different email service
- Check Privy dashboard for any errors

**Issue:** "Email already in use"

- Use a different email address
- If using Gmail aliases, increment the number
- If using temp emails, get a new one

**Issue:** Rate limiting

- Wait 5-10 minutes between signups
- Use different email services
- Use Gmail aliases (they're all the same inbox, so less likely to trigger rate limits)
