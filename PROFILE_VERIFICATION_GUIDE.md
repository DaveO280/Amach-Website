# Amach Health Profile Verification System

## Overview

This comprehensive profile verification system implements restrictive wallet creation with email whitelisting, one-wallet-per-user enforcement, and token allocation for the first 5,000 early adopters. The system is designed for maximum self-custody while maintaining controlled access.

## Architecture

### Smart Contracts

1. **ProfileVerification.sol** - Main verification contract

   - Email whitelist management
   - One-wallet-per-user enforcement
   - Profile verification with signature validation
   - Token allocation tracking (for mainnet migration)

2. **HealthToken.sol** - AHP Token Contract

   - ERC20 token with symbol "AHP"
   - Initial allocation system for early adopters
   - Pausable and burnable functionality
   - 1 billion max supply, 500 million initial

3. **MainnetMigration.sol** - Migration tracking
   - Records all testnet allocations
   - Generates migration proofs for mainnet
   - Ensures 1:1 portability to mainnet
   - Time-limited migration window (1 year)

### Frontend Components

#### User-Facing Components

- **ProfileVerificationFlow.tsx** - Main user verification interface
  - Email validation against whitelist
  - Wallet connection and signature verification
  - Step-by-step verification process
  - Token allocation display

#### Admin Components

- **AdminDashboard.tsx** - Comprehensive admin interface
  - Email whitelist management (add/remove/bulk)
  - Verification statistics and monitoring
  - User verification status tracking
  - System configuration controls

### API Integration

#### User Endpoints (`/api/verification/`)

- `POST /check-email` - Validate email against whitelist
- `POST /verify-profile` - Complete profile verification
- `GET /allocation-info` - Get token allocation information

#### Admin Endpoints (`/api/admin/`)

- `GET /verification-stats` - System statistics
- `GET /email-whitelist` - List whitelisted emails
- `POST /email-whitelist` - Add/remove emails from whitelist
- `GET /verified-users` - List verified users

### Authentication Server Integration

The existing auth server (`auth-server/server.js`) has been extended with:

- Profile verification endpoints
- Admin management endpoints
- Contract interaction capabilities
- Fallback mechanisms for demo/testing

## How It Works

### For Users

1. **Email Check**: User enters email address

   - System checks against whitelist
   - Validates email format
   - Checks if email is already in use

2. **Wallet Connection**: User connects their wallet

   - Integrates with existing wallet system
   - Validates wallet address
   - Ensures wallet isn't already verified

3. **Profile Verification**: User signs message

   - Creates signature proving wallet ownership
   - Calls smart contract verification
   - Receives token allocation (if within first 5,000)

4. **Completion**: User receives confirmation
   - Shows verification status
   - Displays token allocation
   - Provides access to dashboard

### For Admins

1. **Email Management**: Add/remove emails from whitelist

   - Individual email addition
   - Bulk email import
   - Real-time whitelist updates

2. **Monitoring**: Track verification progress

   - Total verified users
   - Token allocation status
   - System health metrics

3. **Configuration**: System settings
   - Enable/disable verification
   - Adjust allocation parameters
   - Manage migration settings

## Integration with Existing Website

### Separation of Concerns

The system maintains clear separation between admin and user interfaces:

- **Admin Interface**: `/admin` - Restricted access, full management capabilities
- **User Interface**: `/verify` - Public access, streamlined verification flow
- **Existing Pages**: Unchanged, verification is optional enhancement

### Wallet Integration

The verification system integrates with your existing wallet infrastructure:

- Uses existing wallet connection logic
- Maintains current wallet UI patterns
- Adds verification as additional step when needed

### Token Integration

Token allocation is designed for seamless mainnet migration:

- Testnet allocations are recorded, not distributed
- Migration proofs enable 1:1 mainnet conversion
- No actual token transfers on testnet
- Full portability when mainnet launches

## Deployment Steps

1. **Deploy Contracts**:

   ```bash
   npx hardhat run scripts/deploy-verification-system.js --network zksync-sepolia
   ```

2. **Configure Environment**:

   ```bash
   cp .env.verification .env.local
   # Update contract addresses and configuration
   ```

3. **Start Auth Server**:

   ```bash
   cd auth-server
   npm start
   ```

4. **Access Interfaces**:
   - User verification: `http://localhost:3000/verify`
   - Admin dashboard: `http://localhost:3000/admin`

## Security Features

### Email Whitelist

- Only whitelisted emails can create profiles
- Admin-controlled whitelist management
- Real-time validation against smart contract

### One-Wallet-Per-User

- Each email can only be linked to one wallet
- Each wallet can only be linked to one email
- Prevents Sybil attacks and duplicate allocations

### Signature Verification

- Cryptographic proof of wallet ownership
- Message signing for verification
- Prevents unauthorized profile creation

### Migration Security

- Time-limited migration window
- One-time migration proofs
- Cryptographic verification of allocations

## Best Practices

### Admin Management

- Regularly review whitelist
- Monitor verification statistics
- Maintain secure admin access
- Document all changes

### User Experience

- Clear verification instructions
- Helpful error messages
- Progress indicators
- Support contact information

### Security

- Secure admin authentication
- Regular security audits
- Monitor for suspicious activity
- Backup verification data

## Future Enhancements

### Phase 1 (Current)

- Email whitelist verification
- One-wallet-per-user enforcement
- Token allocation tracking
- Basic admin interface

### Phase 2 (Future)

- Advanced analytics
- Automated whitelist management
- Enhanced user onboarding
- Integration with health data

### Phase 3 (Mainnet)

- Full token distribution
- DAO governance integration
- Advanced migration tools
- Cross-chain compatibility

## Support and Maintenance

### Monitoring

- Track verification success rates
- Monitor system performance
- Alert on unusual activity
- Regular health checks

### Updates

- Smart contract upgrades
- Frontend improvements
- Security patches
- Feature additions

### Documentation

- Keep deployment guides updated
- Document configuration changes
- Maintain API documentation
- User guide updates

This system provides a robust foundation for controlled, self-custodied user onboarding while maintaining the flexibility to evolve with your platform's needs.
