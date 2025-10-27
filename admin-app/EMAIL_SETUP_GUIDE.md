# Email Setup Guide for Admin Dashboard

## Overview

The admin dashboard includes an automated email system that sends beautiful welcome emails to whitelisted users, prompting them to create wallets and claim their token allocations.

## Email Configuration

### 1. Create Environment File

Create a `.env.local` file in the `admin-app` directory with the following variables:

```bash
# Email Configuration
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_SECURE=false
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=your-app-password

# Verification URL
NEXT_PUBLIC_VERIFICATION_URL=http://localhost:3000/verify

# Admin Configuration
ADMIN_SECRET_KEY=your-super-secure-admin-key
NEXT_PUBLIC_ADMIN_ENABLED=true
```

### 2. Gmail Setup (Recommended)

#### Step 1: Enable 2-Factor Authentication

1. Go to [Google Account Security](https://myaccount.google.com/security)
2. Enable 2-Factor Authentication if not already enabled

#### Step 2: Generate App Password

1. Go to [Google App Passwords](https://myaccount.google.com/apppasswords)
2. Select "Mail" as the app
3. Select "Other" as the device and enter "Amach Health Admin"
4. Copy the generated 16-character password
5. Use this password as `EMAIL_PASS` in your `.env.local` file

#### Step 3: Configure Environment

```bash
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_SECURE=false
EMAIL_USER=your-gmail@gmail.com
EMAIL_PASS=your-16-character-app-password
```

### 3. Alternative Email Providers

#### Outlook/Hotmail

```bash
EMAIL_HOST=smtp-mail.outlook.com
EMAIL_PORT=587
EMAIL_SECURE=false
EMAIL_USER=your-email@outlook.com
EMAIL_PASS=your-password
```

#### Custom SMTP

```bash
EMAIL_HOST=your-smtp-server.com
EMAIL_PORT=587
EMAIL_SECURE=false
EMAIL_USER=your-email@domain.com
EMAIL_PASS=your-password
```

## Features

### 1. Automatic Email Sending

- Emails are automatically sent when users are added to the whitelist
- Bulk email sending to all whitelisted users
- Beautiful HTML email templates with emerald/amber branding

### 2. Email Template Features

- **Professional Design**: Matches Amach Health branding
- **Token Allocation Info**: Shows 1,000 AHP token allocation
- **Step-by-Step Guide**: Clear instructions for wallet setup
- **Direct Links**: Links to verification page
- **Mobile Responsive**: Looks great on all devices

### 3. Admin Dashboard Integration

- **Send to All**: Send emails to all whitelisted users at once
- **Results Tracking**: See success/failure rates
- **Email Status**: Real-time feedback on email delivery
- **Bulk Management**: Handle large email lists efficiently

## Usage

### 1. Adding Users

1. Go to Admin Dashboard → Email Whitelist tab
2. Add individual emails or bulk import
3. Emails are automatically sent to new users

### 2. Sending Welcome Emails

1. Go to Email Whitelist tab
2. Scroll to "Send Welcome Emails" section
3. Click "Send to All" to email all whitelisted users
4. Monitor results in real-time

### 3. Email Content

The emails include:

- Welcome message and congratulations
- Token allocation details (1,000 AHP tokens)
- Step-by-step wallet setup instructions
- Direct link to verification page
- Information about Amach Health Protocol
- Contact information and support links

## Testing

### 1. Test Email Configuration

Visit `http://localhost:3001/api/send-wallet-emails` to check if email service is configured.

### 2. Send Test Email

1. Add your own email to the whitelist
2. Use the "Send to All" button
3. Check your inbox for the welcome email

### 3. Verify Email Content

- Check that links work correctly
- Verify branding and styling
- Test on different email clients

## Troubleshooting

### Common Issues

#### "Email service not configured"

- Check that `.env.local` file exists
- Verify all required environment variables are set
- Ensure app password is correct for Gmail

#### "Authentication failed"

- Verify email username and password
- Check that 2FA is enabled for Gmail
- Ensure app password is used (not regular password)

#### "Connection timeout"

- Check firewall settings
- Verify SMTP server and port
- Try different email provider

### Debug Mode

Set `NODE_ENV=development` to see detailed email logs in the console.

## Security Notes

1. **Never commit `.env.local`** to version control
2. **Use app passwords** instead of regular passwords
3. **Rotate passwords** regularly
4. **Monitor email logs** for suspicious activity
5. **Rate limit** email sending to avoid spam flags

## Production Deployment

### 1. Environment Variables

Set the following in your production environment:

- `EMAIL_HOST`
- `EMAIL_PORT`
- `EMAIL_USER`
- `EMAIL_PASS`
- `NEXT_PUBLIC_VERIFICATION_URL`

### 2. Email Provider

Consider using a dedicated email service like:

- SendGrid
- Mailgun
- Amazon SES
- Postmark

### 3. Monitoring

- Set up email delivery monitoring
- Track bounce rates and complaints
- Monitor email reputation

## Support

For issues with email setup:

1. Check the console logs for error messages
2. Verify environment variables are correct
3. Test with a simple email first
4. Contact support if issues persist

The email system is designed to be robust and user-friendly, helping you onboard new users effectively while maintaining professional communication standards.
