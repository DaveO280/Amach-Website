/**
 * Service Interfaces
 *
 * These interfaces define the contracts for core services in the application.
 * They enable:
 * - Platform-agnostic implementations (web vs iOS native)
 * - Easy unit testing with mock implementations
 * - Clear separation of concerns
 *
 * Implementation mapping:
 *
 * | Interface        | Web Implementation      | iOS Implementation (Future) |
 * |-----------------|-------------------------|----------------------------|
 * | IStorageService  | StorjStorageService     | CloudKitStorageService     |
 * | IHealthDataStore | IndexedDBHealthDataStore| HealthKitDataStore         |
 * | IAuthService     | PrivyAuthService        | WalletConnectAuthService   |
 * | IAiService       | VeniceAiService         | AppleIntelligenceService   |
 */

export type {
  IStorageService,
  StorageReference,
  StoredData,
  StoreOptions,
  ListOptions,
  StorageServiceFactory,
} from "./IStorageService";

export type {
  IHealthDataStore,
  DateRange,
  UploadedFile,
  ProcessedData,
  MergeOptions,
  HealthDataStoreFactory,
} from "./IHealthDataStore";

export type {
  IAuthService,
  UserIdentity,
  SignatureResult,
  EncryptionKey,
  AuthState,
  AuthEventHandlers,
  AuthServiceFactory,
} from "./IAuthService";

export type {
  IAiService,
  UserProfile,
  HealthDataContext,
  ChatMessage,
  ChatOptions,
  ChatResponse,
  AnalysisRequest,
  AnalysisResult,
  AiServiceFactory,
} from "./IAiService";
