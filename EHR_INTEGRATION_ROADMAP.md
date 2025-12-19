# EHR Integration Roadmap - Amach Health

## Executive Summary

This document outlines the three foundational steps needed to enable lightweight EHR integration through FHIR export/import functionality. This approach provides immediate user value while maintaining our long-term vision of protocol-native health data standards.

**Timeline Estimate:** 8-10 weeks for Phase 1 (FHIR Export capability)

---

## FHIR Compatibility Landscape

### What is FHIR?

**FHIR (Fast Healthcare Interoperability Resources)** is a modern healthcare data standard developed by HL7. It uses RESTful APIs, JSON/XML formats, and modern web technologies to enable health data exchange.

### FHIR Adoption by Major EHR Systems (2025)

#### ✅ **Fully FHIR-Compatible Systems:**

**Epic** (40% US market share)

- Full FHIR R4 support since 2020
- Open FHIR APIs via App Orchard
- Supports patient-facing apps via SMART on FHIR
- Over 1,000+ FHIR-enabled apps

**Cerner (Oracle Health)** (25% US market share)

- FHIR R4 certified
- Cerner Code Console for FHIR app development
- Full SMART on FHIR support
- Active developer ecosystem

**Allscripts**

- FHIR R4 support
- Developer sandbox available
- SMART on FHIR compliant

**Meditech**

- FHIR R4 implementation
- Growing API ecosystem

**athenahealth**

- FHIR R4 APIs
- Developer portal with documentation
- SMART on FHIR enabled

**eClinicalWorks**

- FHIR R4 certified
- Patient data access APIs

#### 🟡 **Partial FHIR Support:**

**NextGen Healthcare**

- FHIR APIs available but limited scope
- Primarily focuses on patient demographics and basic clinical data

**Practice Fusion**

- Basic FHIR support
- Limited to specific use cases

#### ❌ **Limited/Legacy Systems:**

**Older VA VistA installations** (being replaced)

- Legacy system with minimal FHIR
- VA is migrating to Cerner FHIR-enabled system

**Smaller proprietary systems**

- May require custom HL7 v2 interfaces

### Global FHIR Adoption

- **United States:** Mandated by 21st Century Cures Act (2022) - all certified EHR systems MUST support FHIR
- **European Union:** Many countries adopting FHIR for cross-border health data exchange
- **Australia:** National FHIR implementation via My Health Record
- **Canada:** Provincial health systems implementing FHIR
- **UK:** NHS adopting FHIR across trusts

### Key Takeaway

**~80% of US healthcare systems now support FHIR** due to federal mandates. The major EHR vendors (Epic, Cerner, Allscripts) that control 70%+ of the market are fully FHIR-compliant. This makes FHIR the most practical standard for health data interoperability.

---

## Phase 1: Core Integration Components

### Step 1: Build FHIR Transformation Layer

**Objective:** Enable bidirectional translation between Amach's internal health data format and FHIR R4 standard resources.

#### 1.1 Data Model Mapping

**Current Amach Data → FHIR Resources**

| Amach Data Structure               | FHIR Resource                                                            | FHIR Profile               |
| ---------------------------------- | ------------------------------------------------------------------------ | -------------------------- |
| `EncryptedProfile` (demographics)  | `Patient`                                                                | US Core Patient            |
| `HealthEvent` (timeline events)    | Multiple: `Observation`, `Condition`, `Procedure`, `MedicationStatement` | US Core profiles           |
| Vital signs (heart rate, BP, etc.) | `Observation`                                                            | US Core Vital Signs        |
| Medications                        | `MedicationStatement`                                                    | US Core Medication         |
| Conditions/Diagnoses               | `Condition`                                                              | US Core Condition          |
| Procedures/Surgeries               | `Procedure`                                                              | US Core Procedure          |
| Allergies                          | `AllergyIntolerance`                                                     | US Core AllergyIntolerance |
| Lab results                        | `Observation`                                                            | US Core Lab Result         |
| Conversations (health notes)       | `DocumentReference` or `Communication`                                   | Basic FHIR                 |

#### 1.2 Technical Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Amach Health App                      │
└─────────────────────────────────────────────────────────┘
                           │
                           ↓
┌─────────────────────────────────────────────────────────┐
│              FHIR Transformation Service                 │
│                                                          │
│  ┌──────────────┐         ┌──────────────┐             │
│  │   Amach →    │         │   FHIR →     │             │
│  │   FHIR       │         │   Amach      │             │
│  │   Exporter   │         │   Importer   │             │
│  └──────────────┘         └──────────────┘             │
│                                                          │
│  ┌──────────────────────────────────────────┐          │
│  │        FHIR Resource Builder              │          │
│  │  - Patient builder                        │          │
│  │  - Observation builder                    │          │
│  │  - Condition builder                      │          │
│  │  - Procedure builder                      │          │
│  │  - Medication builder                     │          │
│  │  - AllergyIntolerance builder             │          │
│  └──────────────────────────────────────────┘          │
│                                                          │
│  ┌──────────────────────────────────────────┐          │
│  │        FHIR Validation Service            │          │
│  │  - Schema validation                      │          │
│  │  - US Core profile validation             │          │
│  │  - Required fields check                  │          │
│  └──────────────────────────────────────────┘          │
└─────────────────────────────────────────────────────────┘
                           │
                           ↓
┌─────────────────────────────────────────────────────────┐
│              FHIR Bundle Generator                       │
│  - Bundles all resources for patient                     │
│  - Creates downloadable JSON/XML                         │
│  - Maintains referential integrity                       │
└─────────────────────────────────────────────────────────┘
```

#### 1.3 Implementation Files

**New Services to Create:**

```
/src/services/fhir/
├── FHIRTransformationService.ts       # Main transformation orchestrator
├── FHIRResourceBuilders.ts            # Builder pattern for each FHIR resource type
├── FHIRValidationService.ts           # Validate FHIR resources
├── FHIRBundleGenerator.ts             # Create FHIR bundles
├── FHIRImportService.ts               # Import FHIR data into Amach format
└── FHIRExportService.ts               # Export Amach data as FHIR

/src/types/fhir/
├── fhirResources.ts                   # TypeScript interfaces for FHIR resources
├── fhirProfiles.ts                    # US Core profile definitions
└── fhirMappings.ts                    # Mapping configurations

/src/utils/fhir/
├── fhirCodeSystems.ts                 # LOINC, SNOMED, RxNorm code mappings
├── fhirDateUtils.ts                   # FHIR date/time formatting
└── fhirValidators.ts                  # Field-level validators
```

#### 1.4 Example FHIR Resource Mapping

**Amach Health Event → FHIR Observation (Blood Pressure)**

```typescript
// Input: Amach HealthEvent
{
  id: "evt_123",
  eventType: "BLOOD_PRESSURE_RECORDED",
  timestamp: 1703001600000,
  data: {
    systolic: 120,
    diastolic: 80,
    pulse: 72
  }
}

// Output: FHIR Observation (Blood Pressure)
{
  resourceType: "Observation",
  id: "obs-bp-evt123",
  meta: {
    profile: ["http://hl7.org/fhir/StructureDefinition/vitalsigns"]
  },
  status: "final",
  category: [{
    coding: [{
      system: "http://terminology.hl7.org/CodeSystem/observation-category",
      code: "vital-signs",
      display: "Vital Signs"
    }]
  }],
  code: {
    coding: [{
      system: "http://loinc.org",
      code: "85354-9",
      display: "Blood pressure panel"
    }]
  },
  subject: {
    reference: "Patient/wallet-0x123abc"
  },
  effectiveDateTime: "2023-12-19T12:00:00Z",
  component: [
    {
      code: {
        coding: [{
          system: "http://loinc.org",
          code: "8480-6",
          display: "Systolic blood pressure"
        }]
      },
      valueQuantity: {
        value: 120,
        unit: "mmHg",
        system: "http://unitsofmeasure.org",
        code: "mm[Hg]"
      }
    },
    {
      code: {
        coding: [{
          system: "http://loinc.org",
          code: "8462-4",
          display: "Diastolic blood pressure"
        }]
      },
      valueQuantity: {
        value: 80,
        unit: "mmHg",
        system: "http://unitsofmeasure.org",
        code: "mm[Hg]"
      }
    }
  ]
}
```

#### 1.5 Key Design Decisions

**Maintain Encryption:**

- FHIR export should be plaintext (for EHR consumption)
- Only export after user explicitly requests download
- Never store unencrypted FHIR in persistent storage
- Export happens client-side after decryption

**Bidirectional Mapping:**

- Every Amach event type should map to FHIR
- FHIR imports should preserve original FHIR references
- Store original FHIR resource ID for traceability
- Handle conflicts when both systems have same data

**Versioning:**

- Support FHIR R4 (current standard)
- Design for future R5 compatibility
- Version all mappings for future updates

#### 1.6 User Experience Flow

**Export Flow:**

```
1. User clicks "Export Health Data"
2. Select date range (optional: "All time")
3. Select data types (Medications, Conditions, Vitals, etc.)
4. Click "Download FHIR Bundle"
5. System:
   - Retrieves encrypted data from Storj
   - Decrypts with wallet key
   - Transforms to FHIR resources
   - Validates against US Core profiles
   - Generates FHIR Bundle (JSON)
   - Downloads to user's computer
6. User uploads JSON to their EHR patient portal
```

**Import Flow:**

```
1. User downloads FHIR data from EHR portal
2. User clicks "Import Health Data" in Amach
3. Upload FHIR Bundle JSON file
4. System:
   - Validates FHIR structure
   - Parses FHIR resources
   - Converts to Amach format
   - Checks for duplicates
   - Shows preview of what will be imported
5. User confirms import
6. System encrypts and stores in Storj + blockchain
```

#### 1.7 Deliverables

- [ ] FHIR transformation service with unit tests
- [ ] Support for top 10 most common health data types
- [ ] FHIR Bundle download functionality (JSON format)
- [ ] Basic FHIR import from uploaded file
- [ ] User documentation on how to use export/import
- [ ] Validation against US Core profiles

**Effort Estimate:** 3-4 weeks

**Dependencies:** None (can start immediately)

---

### Step 2: Implement SMART on FHIR Authentication

**Objective:** Enable secure, standardized OAuth2-based authentication for third-party apps to access Amach health data via FHIR APIs.

#### 2.1 Why SMART on FHIR?

**Beyond EHR Integration:**

- Enables third-party health apps to integrate with Amach
- Standard authentication used by Epic, Cerner, and all major EHRs
- Opens ecosystem for health analytics, research apps, telehealth
- Required for bidirectional EHR sync (not just export/import)

**Use Cases:**

- Research studies requesting access to anonymized data
- Health coaching apps analyzing your metrics
- Telemedicine platforms accessing your history
- Clinical trial enrollment based on health profile
- Insurance verification (with explicit consent)

#### 2.2 SMART on FHIR Architecture

```
┌─────────────────────────────────────────────────────────┐
│                  Third-Party App                         │
│              (e.g., Research Study App)                  │
└─────────────────────────────────────────────────────────┘
                           │
                           │ 1. Authorization Request
                           │    (with scopes: patient/*.read)
                           ↓
┌─────────────────────────────────────────────────────────┐
│              Amach SMART Authorization Server            │
│                                                          │
│  ┌────────────────────────────────────────┐            │
│  │   OAuth 2.0 Authorization Endpoint     │            │
│  │   - /authorize                          │            │
│  │   - /token                              │            │
│  │   - /introspect                         │            │
│  └────────────────────────────────────────┘            │
│                                                          │
│  ┌────────────────────────────────────────┐            │
│  │      User Consent Screen                │            │
│  │  "Research App X wants to access:       │            │
│  │   ✓ Your medications                    │            │
│  │   ✓ Your conditions                     │            │
│  │   ✓ Your vital signs"                   │            │
│  │                                          │            │
│  │  [Approve] [Deny]                       │            │
│  └────────────────────────────────────────┘            │
└─────────────────────────────────────────────────────────┘
                           │
                           │ 2. Authorization Code
                           ↓
                 (App exchanges code for token)
                           │
                           │ 3. Access Token (JWT)
                           ↓
┌─────────────────────────────────────────────────────────┐
│                Amach FHIR API Server                     │
│                                                          │
│  ┌────────────────────────────────────────┐            │
│  │    FHIR API Endpoints                   │            │
│  │    - GET /fhir/Patient/[id]             │            │
│  │    - GET /fhir/Observation?patient=[id] │            │
│  │    - GET /fhir/Condition?patient=[id]   │            │
│  │    - GET /fhir/MedicationStatement...   │            │
│  └────────────────────────────────────────┘            │
│                                                          │
│  ┌────────────────────────────────────────┐            │
│  │    Token Validation Middleware          │            │
│  │    - Verify JWT signature               │            │
│  │    - Check token expiration             │            │
│  │    - Validate scopes                    │            │
│  │    - Enforce consent permissions        │            │
│  └────────────────────────────────────────┘            │
└─────────────────────────────────────────────────────────┘
                           │
                           │ 4. FHIR Resources (filtered by consent)
                           ↓
┌─────────────────────────────────────────────────────────┐
│                  Third-Party App                         │
│         (Receives only consented data in FHIR format)    │
└─────────────────────────────────────────────────────────┘
```

#### 2.3 OAuth 2.0 Flow Implementation

**Authorization Code Grant with PKCE** (most secure)

```
Step 1: App initiates authorization
GET /oauth/authorize?
  response_type=code
  &client_id=research-app-123
  &redirect_uri=https://researchapp.com/callback
  &scope=patient/Observation.read patient/Condition.read
  &state=random-state-token
  &code_challenge=hashed-verifier
  &code_challenge_method=S256

Step 2: User logs in with Privy wallet and approves consent

Step 3: Amach redirects back with authorization code
https://researchapp.com/callback?
  code=AUTH_CODE_XYZ
  &state=random-state-token

Step 4: App exchanges code for token
POST /oauth/token
  grant_type=authorization_code
  &code=AUTH_CODE_XYZ
  &redirect_uri=https://researchapp.com/callback
  &client_id=research-app-123
  &code_verifier=original-verifier

Step 5: Amach returns access token
{
  "access_token": "eyJhbGciOiJSUzI1NiIs...",
  "token_type": "Bearer",
  "expires_in": 3600,
  "scope": "patient/Observation.read patient/Condition.read",
  "patient": "wallet-0x123abc"
}

Step 6: App uses token to access FHIR data
GET /fhir/Observation?patient=wallet-0x123abc
Authorization: Bearer eyJhbGciOiJSUzI1NiIs...
```

#### 2.4 SMART Scopes Implementation

**Scope Format:** `[context]/[resource].[permission]`

**Common Scopes:**

| Scope                              | Description                        | Example Use Case            |
| ---------------------------------- | ---------------------------------- | --------------------------- |
| `patient/*.read`                   | Read all patient resources         | Full health record access   |
| `patient/Observation.read`         | Read vital signs, labs             | Fitness app tracking trends |
| `patient/Condition.read`           | Read conditions/diagnoses          | Research study eligibility  |
| `patient/MedicationStatement.read` | Read medications                   | Drug interaction checker    |
| `patient/Procedure.read`           | Read procedures/surgeries          | Pre-surgical planning app   |
| `user/*.write`                     | Write data on behalf of user       | Health journaling app       |
| `launch/patient`                   | Launched in patient context        | EHR-embedded app            |
| `offline_access`                   | Refresh token for long-term access | Continuous monitoring app   |

**Granular Permission Model:**

```typescript
interface ConsentGrant {
  clientId: string; // "research-app-123"
  scopes: string[]; // ["patient/Observation.read"]
  grantedAt: number; // Unix timestamp
  expiresAt: number; // Unix timestamp
  isActive: boolean; // Can be revoked by user

  // Additional constraints
  dateRangeStart?: string; // Only data after this date
  dateRangeEnd?: string; // Only data before this date
  specificConditions?: string[]; // Only diabetes-related data
  purposeOfUse: string; // "Research study", "Clinical care"
}
```

#### 2.5 Integration with Privy Wallet

**Challenge:** Bridge Web3 wallet auth with OAuth2

**Solution:**

```
1. User authenticates with Privy wallet (existing flow)
2. Privy session establishes user identity (wallet address)
3. OAuth authorization endpoint validates Privy session
4. Issue OAuth tokens tied to wallet address
5. FHIR API validates OAuth token AND checks wallet signature
```

**Token Structure (JWT):**

```json
{
  "iss": "https://amachhealth.com",
  "sub": "wallet-0x123abc...",
  "aud": "research-app-123",
  "exp": 1703005200,
  "iat": 1703001600,
  "scope": "patient/Observation.read patient/Condition.read",
  "patient": "wallet-0x123abc...",
  "wallet_address": "0x123abc...",
  "encryption_key_approved": true
}
```

#### 2.6 Implementation Files

```
/src/services/oauth/
├── SMARTAuthorizationServer.ts        # OAuth 2.0 endpoints
├── TokenService.ts                    # JWT generation/validation
├── ScopeValidator.ts                  # Scope checking logic
├── ConsentManager.ts                  # User consent tracking
└── PKCEValidator.ts                   # PKCE flow security

/src/app/api/oauth/
├── authorize/route.ts                 # GET /oauth/authorize
├── token/route.ts                     # POST /oauth/token
├── introspect/route.ts                # POST /oauth/introspect
└── revoke/route.ts                    # POST /oauth/revoke

/src/app/api/fhir/
├── Patient/[id]/route.ts              # FHIR Patient endpoint
├── Observation/route.ts               # FHIR Observation endpoint
├── Condition/route.ts                 # FHIR Condition endpoint
└── _middleware.ts                     # Token validation middleware

/src/components/consent/
├── ConsentScreen.tsx                  # User-facing consent UI
├── ConsentManagement.tsx              # User's consent dashboard
└── ScopeDescription.tsx               # Human-readable scope explanations

/src/utils/oauth/
├── jwtUtils.ts                        # JWT signing/verification
├── scopeParser.ts                     # Parse SMART scopes
└── pkceUtils.ts                       # PKCE challenge/verifier
```

#### 2.7 Security Considerations

**Token Security:**

- Short-lived access tokens (1 hour)
- Refresh tokens for extended access (if `offline_access` granted)
- Token revocation endpoint
- Rate limiting on token endpoints

**Consent Management:**

- User can revoke consent anytime
- Granular consent per resource type
- Audit log of all data access
- Consent expiration (default: 90 days)

**Client Registration:**

- Register third-party apps before use
- Validate redirect URIs (prevent hijacking)
- Client credentials for confidential clients
- Public clients use PKCE (no client secrets)

#### 2.8 User Experience

**Consent Screen Example:**

```
┌──────────────────────────────────────────────────────┐
│  Research Study X wants to access your health data   │
│                                                       │
│  This app is requesting access to:                   │
│                                                       │
│  ✓ Your vital signs (heart rate, blood pressure)    │
│  ✓ Your diagnosed conditions                         │
│  ✓ Your medications                                  │
│                                                       │
│  This access will expire in 90 days                  │
│                                                       │
│  Purpose: Clinical research study on hypertension    │
│                                                       │
│  [Learn More About This Study]                       │
│                                                       │
│  ┌──────────────┐  ┌──────────────┐                │
│  │   Approve    │  │     Deny     │                │
│  └──────────────┘  └──────────────┘                │
└──────────────────────────────────────────────────────┘
```

**User Consent Dashboard:**

```
My Data Sharing

Active Permissions:
┌─────────────────────────────────────────────────┐
│ Research Study X                                 │
│ Access: Vitals, Conditions, Medications         │
│ Granted: Dec 19, 2024                           │
│ Expires: Mar 19, 2025                           │
│ Last accessed: 2 hours ago                      │
│ [View Details] [Revoke Access]                  │
└─────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────┐
│ Fitness Tracker Pro                              │
│ Access: Vitals only                              │
│ Granted: Nov 1, 2024                            │
│ Expires: Feb 1, 2025                            │
│ Last accessed: 5 minutes ago                    │
│ [View Details] [Revoke Access]                  │
└─────────────────────────────────────────────────┘
```

#### 2.9 Deliverables

- [ ] OAuth 2.0 authorization server with PKCE support
- [ ] JWT-based access tokens with wallet binding
- [ ] SMART scope validation and enforcement
- [ ] User consent screen with approval/denial flow
- [ ] User consent management dashboard
- [ ] Token revocation functionality
- [ ] FHIR API middleware for token validation
- [ ] Client registration system (admin interface)
- [ ] Developer documentation for third-party apps
- [ ] Rate limiting and security monitoring

**Effort Estimate:** 3-4 weeks

**Dependencies:**

- FHIR Transformation Layer (Step 1) must be complete
- FHIR API endpoints must exist to protect with OAuth

---

### Step 3: Enhanced Audit Logging

**Objective:** Implement comprehensive, tamper-evident audit logging for all health data access to meet HIPAA requirements and build user trust.

#### 3.1 Why Audit Logging?

**Regulatory Requirements:**

- **HIPAA Security Rule:** Requires tracking all access to ePHI (electronic Protected Health Information)
- **HIPAA Privacy Rule:** Patients have right to "accounting of disclosures"
- **21st Century Cures Act:** Transparency in who accesses patient data

**User Trust:**

- Shows users exactly who accessed their data and when
- Enables detection of unauthorized access
- Provides transparency for data sharing

**Security:**

- Detects potential breaches
- Forensic analysis after incidents
- Compliance auditing

#### 3.2 What to Log

**Access Events:**

```typescript
interface AccessLogEntry {
  // Who
  accessor: {
    type: "patient" | "third-party-app" | "system" | "admin";
    id: string; // Wallet address or client ID
    name?: string; // Human-readable name
    ipAddress: string; // Source IP
    userAgent: string; // Browser/device info
  };

  // What
  action: {
    type: "read" | "write" | "update" | "delete" | "export" | "share";
    resource: "Patient" | "Observation" | "Condition" | "Medication" | etc;
    resourceId?: string; // Specific resource accessed
    dataScope: string[]; // What fields were accessed
  };

  // When
  timestamp: number; // Unix timestamp

  // Why
  purpose: string; // "Patient portal access", "Research study X"
  legalBasis?: string; // "Patient consent", "Treatment", "Research"

  // How
  method: {
    interface: "web-ui" | "api" | "export" | "sync";
    protocol: "https" | "smart-fhir";
    authMethod: "wallet-signature" | "oauth-token" | "session";
    tokenId?: string; // OAuth token ID if applicable
  };

  // Outcome
  result: {
    success: boolean;
    statusCode?: number; // HTTP status
    errorMessage?: string; // If failed
    recordsAccessed?: number; // How many records returned
  };

  // Blockchain proof
  blockchainProof: {
    txHash?: string; // If written to blockchain
    merkleRoot?: string; // Root of audit log batch
    blockNumber?: number;
  };
}
```

**Consent Events:**

```typescript
interface ConsentLogEntry {
  userId: string; // Wallet address
  action: "granted" | "revoked" | "expired" | "modified";
  consentId: string;
  thirdParty: {
    clientId: string;
    name: string;
  };
  scopes: string[]; // What was granted
  timestamp: number;
  expiresAt: number;
  constraints?: {
    dateRange?: { start: string; end: string };
    dataCategories?: string[];
  };
}
```

**Data Modification Events:**

```typescript
interface DataChangeLogEntry {
  userId: string;
  action: "create" | "update" | "delete" | "encrypt" | "decrypt";
  resourceType: string;
  resourceId: string;
  changedFields?: string[]; // What fields changed
  previousHash?: string; // Hash of previous state
  newHash: string; // Hash of new state
  timestamp: number;
  storjUri?: string; // If stored in Storj
  blockchainTxHash?: string; // If recorded on-chain
}
```

#### 3.3 Audit Log Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    User Action                           │
│         (Read data, Grant consent, Export, etc.)         │
└─────────────────────────────────────────────────────────┘
                           │
                           ↓
┌─────────────────────────────────────────────────────────┐
│                 Audit Log Middleware                     │
│  - Intercepts all data access                            │
│  - Enriches with context (IP, user-agent, etc.)         │
│  - Does not block operation (async logging)              │
└─────────────────────────────────────────────────────────┘
                           │
                           ↓
┌─────────────────────────────────────────────────────────┐
│              Audit Log Service                           │
│                                                          │
│  ┌────────────────────────────────────────┐            │
│  │   Structured Log Builder                │            │
│  │   - Normalizes log format               │            │
│  │   - Adds cryptographic hash             │            │
│  │   - Assigns sequential ID               │            │
│  └────────────────────────────────────────┘            │
│                                                          │
│  ┌────────────────────────────────────────┐            │
│  │   Multi-Tier Storage                    │            │
│  │                                          │            │
│  │   1. Hot Storage (PostgreSQL)           │            │
│  │      - Last 90 days                     │            │
│  │      - Fast queries                     │            │
│  │                                          │            │
│  │   2. Warm Storage (Encrypted Storj)     │            │
│  │      - 1-7 years                        │            │
│  │      - Compressed batches               │            │
│  │                                          │            │
│  │   3. Cold Storage (Blockchain)          │            │
│  │      - Merkle roots only                │            │
│  │      - Tamper-evident proof             │            │
│  │      - Permanent retention              │            │
│  └────────────────────────────────────────┘            │
└─────────────────────────────────────────────────────────┘
                           │
                           ↓
┌─────────────────────────────────────────────────────────┐
│              Audit Log Blockchain Contract               │
│                                                          │
│  event AuditBatchRecorded(                              │
│    bytes32 merkleRoot,                                   │
│    uint256 startTimestamp,                               │
│    uint256 endTimestamp,                                 │
│    uint256 logCount,                                     │
│    string storjUri                                       │
│  );                                                      │
│                                                          │
│  - Records Merkle root of log batches                    │
│  - Tamper detection via Merkle proof                     │
│  - Points to full logs in encrypted Storj                │
└─────────────────────────────────────────────────────────┘
```

#### 3.4 Tamper-Evident Design

**Merkle Tree Batching:**

```
Every hour:
1. Collect all audit logs from past hour
2. Build Merkle tree of log hashes
3. Compute Merkle root
4. Write Merkle root to blockchain
5. Upload full log batch to encrypted Storj
6. Store Storj URI on-chain

Verification:
1. User requests audit log for specific event
2. System retrieves log from storage
3. System retrieves Merkle proof from blockchain
4. User can verify log wasn't tampered with
```

**Log Chaining:**

```typescript
interface ChainedLogEntry extends AccessLogEntry {
  sequenceNumber: number; // Monotonically increasing
  previousLogHash: string; // Hash of previous log entry
  currentLogHash: string; // Hash of this entry
  merkleProof?: string[]; // Proof for blockchain verification
}

// Each log includes hash of previous log
// Breaking the chain = tampering detected
```

#### 3.5 HIPAA-Required Tracking

**Minimum Necessary Rule:**

- Track what specific fields were accessed (not just "read patient record")
- Log rationale/purpose for access
- Flag accesses that seem excessive

**Right to Accounting of Disclosures:**

- Patient can query: "Who accessed my data in last 6 years?"
- Must show: date, recipient, purpose, data disclosed
- Exclude: Treatment, payment, operations (TPO) - these are logged but not required to disclose

**Retention:**

- HIPAA requires 6 years of audit logs
- We'll keep encrypted logs in Storj for 7 years
- Blockchain Merkle roots permanent (minimal storage cost)

#### 3.6 Implementation Files

```
/src/services/audit/
├── AuditLogService.ts                 # Main logging orchestrator
├── AuditMiddleware.ts                 # Express/Next.js middleware
├── LogEnricher.ts                     # Add IP, user-agent, context
├── MerkleTreeBuilder.ts               # Build Merkle trees
├── AuditLogStorage.ts                 # Multi-tier storage manager
└── AuditLogQuery.ts                   # Query interface for users

/src/services/audit/storage/
├── HotStorageAdapter.ts               # PostgreSQL for recent logs
├── WarmStorageAdapter.ts              # Storj for historical logs
└── BlockchainAdapter.ts               # Write Merkle roots on-chain

/contracts/
└── AuditLogRegistry.sol               # Smart contract for Merkle roots

/src/components/audit/
├── MyAccessLog.tsx                    # User-facing audit log viewer
├── ConsentHistory.tsx                 # Show consent grants/revocations
└── DataAccessTimeline.tsx             # Visual timeline of access events

/src/app/api/audit/
├── logs/route.ts                      # GET /api/audit/logs (user's own logs)
├── verify/route.ts                    # POST /api/audit/verify (Merkle proof)
└── accounting/route.ts                # GET /api/audit/accounting (HIPAA disclosures)
```

#### 3.7 User Experience

**User's Audit Log Dashboard:**

```
My Data Access Log

Filters: [Last 30 days ▼] [All types ▼] [Search...]

┌─────────────────────────────────────────────────────────┐
│ Dec 16, 2024 at 2:45 PM                                  │
│ ✓ You exported your health data                          │
│ • Format: FHIR Bundle                                    │
│ • Data: All medications, conditions, vitals              │
│ • Location: Chrome browser, IP 192.168.1.1              │
│ [View Details]                                           │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│ Dec 16, 2024 at 10:22 AM                                 │
│ ⚠️ Research Study X accessed your data                   │
│ • Accessed: Blood pressure readings (last 90 days)      │
│ • Purpose: Hypertension research study                   │
│ • Authorization: You approved on Dec 1, 2024            │
│ [View Details] [Revoke Access]                          │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│ Dec 15, 2024 at 8:15 PM                                  │
│ ✓ You added a new medication                             │
│ • Medication: Lisinopril 10mg                            │
│ • Encrypted and stored on protocol                       │
│ [View Details]                                           │
└─────────────────────────────────────────────────────────┘

[Download Full Audit Log] [Verify Blockchain Proof]
```

**Blockchain Verification:**

```
Verify Audit Log Integrity

Log Entry ID: log_2024_12_16_1445_user123

✓ Log found in storage
✓ Merkle proof valid
✓ Blockchain verification: Success

Blockchain Details:
• Network: zkSync Era Mainnet
• Transaction: 0xabc123...
• Block Number: 45,231,892
• Merkle Root: 0xdef456...
• Batch: 2024-12-16 14:00-15:00 UTC
• Logs in Batch: 1,247

This audit log has NOT been tampered with since creation.

[Download Verification Certificate]
```

#### 3.8 Performance Considerations

**Async Logging:**

- Audit logging should never block user operations
- Use message queue (e.g., Redis pub/sub, AWS SQS)
- Background worker processes logs

**Indexing:**

- Index by: userId, timestamp, resourceType, action
- Full-text search on purpose/description
- Partition by date for fast queries

**Storage Costs:**

```
Estimated log volume:
- 1,000 active users
- 50 data accesses per user per day
- 50,000 logs/day
- ~5 KB per log entry
- 250 MB/day = 7.5 GB/month

Hot storage (PostgreSQL): ~$5/month
Warm storage (Storj): ~$0.40/month (compressed)
Blockchain (Merkle roots): ~$0.10/day = $3/month

Total: ~$10/month for 1,000 users
```

#### 3.9 Compliance Features

**HIPAA Accounting of Disclosures:**

```
GET /api/audit/accounting?
  userId=wallet-0x123
  &startDate=2024-01-01
  &endDate=2024-12-31

Returns:
{
  "accountingPeriod": {
    "start": "2024-01-01",
    "end": "2024-12-31"
  },
  "disclosures": [
    {
      "date": "2024-12-01",
      "recipient": "Research Study X",
      "purpose": "Clinical research on hypertension",
      "dataDisclosed": "Blood pressure readings (90 days)",
      "legalBasis": "Patient authorization",
      "authorizationExpires": "2025-03-01"
    },
    {
      "date": "2024-11-15",
      "recipient": "Telehealth Provider Y",
      "purpose": "Remote consultation",
      "dataDisclosed": "Complete health record",
      "legalBasis": "Treatment",
      "authorizationExpires": null
    }
  ]
}
```

**Breach Detection:**

- Anomaly detection: unusual access patterns
- Alert if user accesses own data from new IP/country
- Alert if third-party exceeds rate limits
- Alert if data accessed outside consent scope

#### 3.10 Deliverables

- [ ] Audit log service with multi-tier storage
- [ ] Middleware to capture all data access events
- [ ] Merkle tree batching and blockchain recording
- [ ] Smart contract for audit log Merkle roots
- [ ] User-facing audit log dashboard
- [ ] Blockchain verification tool
- [ ] HIPAA accounting of disclosures API
- [ ] Anomaly detection and alerting
- [ ] 7-year retention policy implementation
- [ ] Performance optimization (async, indexing)
- [ ] Admin tools for compliance auditing

**Effort Estimate:** 3-4 weeks

**Dependencies:**

- Smart contract deployment capability (already have)
- Storj integration (already have)
- User authentication (already have via Privy)

---

## Summary Timeline

| Phase | Component                 | Duration  | Start After                 |
| ----- | ------------------------- | --------- | --------------------------- |
| 1     | FHIR Transformation Layer | 3-4 weeks | Immediately                 |
| 2     | SMART on FHIR Auth        | 3-4 weeks | Phase 1 complete            |
| 3     | Enhanced Audit Logging    | 3-4 weeks | Can run parallel to Phase 2 |

**Total Time:** 8-10 weeks for all three components

**Parallel Execution:**

- Phase 1 must complete first
- Phase 2 and 3 can run partially in parallel (save 1-2 weeks)
- Realistic timeline: **9-10 weeks** with 1-2 developers

---

## Recommended Next Steps

### Immediate Actions (Week 1):

1. ✅ Review this document with team
2. Set up project structure for FHIR services
3. Research FHIR libraries (consider: [fhir.js](https://github.com/FHIR/fhir.js), [@asymmetrik/node-fhir-server-core](https://github.com/Asymmetrik/node-fhir-server-core))
4. Design database schema for audit logs
5. Prototype: Export single HealthEvent as FHIR Observation

### Phase 1 Kickoff (Week 2):

1. Build FHIR Patient resource from EncryptedProfile
2. Build FHIR Observation from vital sign events
3. Implement FHIR Bundle generator
4. Create download button in UI

### Quick Win (Week 3-4):

1. Launch "Export My Data" feature (FHIR JSON download)
2. User documentation on how to upload to Epic MyChart
3. Collect feedback from early users
4. Iterate on data completeness

---

## Long-Term Vision

**Phase 1 (Months 1-3):** Export/Import FHIR bundles

- Users can download their Amach data in FHIR format
- Users can upload FHIR data from EHRs into Amach

**Phase 2 (Months 4-6):** SMART on FHIR ecosystem

- Third-party apps can request access via OAuth
- Research studies can access anonymized data
- Telehealth apps can integrate

**Phase 3 (Months 7-12):** Direct EHR integration

- Epic MyChart bidirectional sync
- Cerner patient portal integration
- Real-time updates (webhooks)

**Phase 4 (Year 2+):** Protocol-native becomes the standard

- Other health apps adopt Amach protocol directly
- FHIR becomes legacy export format
- Blockchain-native health records as the new standard

---

## Conclusion

This roadmap provides a pragmatic path to EHR interoperability while maintaining your vision of protocol-native health data. The three foundational steps are:

1. **FHIR Transformation** - Immediate user value through data portability
2. **SMART Auth** - Unlocks third-party ecosystem and research use cases
3. **Audit Logging** - Builds trust, meets regulations, enables transparency

Together, these components position Amach Health as a HIPAA-compliant, interoperable health data platform that can bridge the gap between legacy EHR systems and the future of decentralized health records.

The lightweight approach (export/import) provides immediate utility while you build toward direct integration. Most importantly, it validates product-market fit before committing to the heavier lift of real-time EHR synchronization.
