/**
 * Storage module exports
 */

export {
  StorjClient,
  createStorjClient,
  type DownloadResult,
  type StorageReference,
  type StorjConfig,
  type UploadOptions,
} from "./StorjClient";

export {
  StorageService,
  createStorageService,
  getStorageService,
  type RetrievedHealthData,
  type StoreOptions,
  type StoredHealthData,
} from "./StorageService";

export {
  StorjTimelineService,
  createStorjTimelineService,
  getStorjTimelineService,
  type BatchTimelineEventResult,
  type TimelineEventOptions,
  type TimelineEventResult,
} from "./StorjTimelineService";

export {
  StorjConversationService,
  createStorjConversationService,
  getStorjConversationService,
  type ConversationStorageOptions,
  type ConversationStorageResult,
} from "./StorjConversationService";

export {
  StorjSyncService,
  createStorjSyncService,
  getStorjSyncService,
  type SyncOptions,
  type SyncResult,
} from "./StorjSyncService";

export {
  StorjReportService,
  getStorjReportService,
  type ReportStorageOptions,
  type ReportStorageResult,
} from "./StorjReportService";

export {
  AttestationService,
  attestationAbi,
  getAttestationErrorMessage,
  type AttestationInput,
  type AttestationResult,
  type AttestationVerification,
  type OnChainAttestation,
} from "./AttestationService";
