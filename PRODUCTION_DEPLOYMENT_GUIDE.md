# Production Deployment Guide

## Architecture Overview

For production, we've separated the admin interface from the user interface to ensure proper security and maintainability:

### User Application (Main Site)

- **URL**: `https://amachhealth.com` (or your domain)
- **Port**: 3000 (development)
- **Purpose**: Public-facing user interface
- **Features**: Profile verification, health dashboard, wallet management

### Admin Application (Separate)

- **URL**: `https://admin.amachhealth.com` (or subdomain)
- **Port**: 3001 (development)
- **Purpose**: Administrative interface
- **Features**: Email whitelist management, user monitoring, system configuration

## Deployment Strategy

### Option 1: Subdomain Separation (Recommended)

```
User App:    https://amachhealth.com
Admin App:   https://admin.amachhealth.com
API:         https://api.amachhealth.com (optional)
```

### Option 2: Path Separation

```
User App:    https://amachhealth.com
Admin App:   https://amachhealth.com/admin
```

### Option 3: Separate Domains

```
User App:    https://amachhealth.com
Admin App:   https://admin.amachhealth.com
```

## Deployment Steps

### 1. User Application Deployment

```bash
# Build the user application
cd Amach-Website
npm run build

# Deploy to your hosting provider (Vercel, Netlify, etc.)
# The user app should be accessible at your main domain
```

### 2. Admin Application Deployment

```bash
# Build the admin application
cd Amach-Website/admin-app
npm run build

# Deploy to a separate subdomain or domain
# Configure your hosting provider for admin.amachhealth.com
```

### 3. Environment Configuration

#### User Application (.env.local)

```bash
# Main app configuration
NEXT_PUBLIC_API_URL=https://api.amachhealth.com
NEXT_PUBLIC_ADMIN_URL=https://admin.amachhealth.com

# Contract addresses
NEXT_PUBLIC_PROFILE_VERIFICATION_CONTRACT=0x...
NEXT_PUBLIC_HEALTH_TOKEN_CONTRACT=0x...
NEXT_PUBLIC_MAINNET_MIGRATION_CONTRACT=0x...

# Network configuration
NEXT_PUBLIC_ZKSYNC_RPC_URL=https://mainnet.era.zksync.io
NEXT_PUBLIC_ZKSYNC_CHAIN_ID=324
```

#### Admin Application (.env.local)

```bash
# Admin app configuration
NEXT_PUBLIC_API_URL=https://api.amachhealth.com
NEXT_PUBLIC_USER_APP_URL=https://amachhealth.com

# Admin authentication
ADMIN_SECRET_KEY=your-super-secure-admin-key
NEXT_PUBLIC_ADMIN_ENABLED=true

# Contract addresses (same as user app)
NEXT_PUBLIC_PROFILE_VERIFICATION_CONTRACT=0x...
NEXT_PUBLIC_HEALTH_TOKEN_CONTRACT=0x...
NEXT_PUBLIC_MAINNET_MIGRATION_CONTRACT=0x...

# Admin wallet configuration
ADMIN_PRIVATE_KEY=your-admin-wallet-private-key
```

### 4. DNS Configuration

Configure your DNS to point to the appropriate hosting providers:

```
# Main domain
amachhealth.com          -> User App (Vercel/Netlify)
www.amachhealth.com      -> User App (Vercel/Netlify)

# Admin subdomain
admin.amachhealth.com    -> Admin App (separate deployment)

# API subdomain (if using separate API)
api.amachhealth.com      -> API server
```

### 5. Security Configuration

#### Admin Interface Security

```bash
# Add to admin app next.config.js
module.exports = {
  // ... other config
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'X-Robots-Tag',
            value: 'noindex, nofollow',
          },
        ],
      },
    ];
  },
};
```

#### CORS Configuration

```bash
# In your API server or auth server
const corsOptions = {
  origin: [
    'https://amachhealth.com',
    'https://admin.amachhealth.com',
    'http://localhost:3000', // Development
    'http://localhost:3001', // Development
  ],
  credentials: true,
};
```

## Development vs Production

### Development Setup

```bash
# Terminal 1: User app
cd Amach-Website
npm run dev

# Terminal 2: Admin app
cd Amach-Website/admin-app
npm run dev

# Terminal 3: Auth server
cd Amach-Website/auth-server
npm start
```

### Production URLs

- **User App**: `https://amachhealth.com`
- **Admin App**: `https://admin.amachhealth.com`
- **API**: `https://api.amachhealth.com` (or integrated)

## Security Considerations

### 1. Admin Access Control

- Use strong authentication for admin interface
- Implement IP whitelisting for admin access
- Use HTTPS for all communications
- Regular security audits

### 2. API Security

- Rate limiting on all endpoints
- Authentication tokens for admin endpoints
- CORS properly configured
- Input validation and sanitization

### 3. Smart Contract Security

- Multi-signature wallets for admin functions
- Time-locked admin actions
- Regular contract audits
- Emergency pause functionality

## Monitoring and Maintenance

### 1. User Application Monitoring

- User verification success rates
- API response times
- Error rates and logs
- User engagement metrics

### 2. Admin Application Monitoring

- Admin access logs
- System configuration changes
- Email whitelist modifications
- Contract interaction success rates

### 3. Backup and Recovery

- Regular database backups
- Contract state backups
- Configuration backups
- Disaster recovery procedures

## Scaling Considerations

### 1. User Growth

- CDN for static assets
- Database optimization
- API rate limiting
- Load balancing

### 2. Admin Operations

- Bulk email management
- Automated monitoring
- Alert systems
- Performance optimization

## Support and Documentation

### 1. User Documentation

- Profile verification guide
- Wallet connection help
- FAQ section
- Contact support

### 2. Admin Documentation

- System administration guide
- Troubleshooting procedures
- Security protocols
- Emergency procedures

This separation ensures that your admin interface is completely isolated from your user-facing application, providing better security, maintainability, and scalability for production use.
