/**
 * Storage module exports
 */

export {
  createStorjClient,
  StorjClient,
  type DownloadResult,
  type StorageReference,
  type StorjConfig,
  type UploadOptions,
} from "./StorjClient";

export {
  createStorageService,
  getStorageService,
  StorageService,
  type RetrievedHealthData,
  type StoredHealthData,
  type StoreOptions,
} from "./StorageService";

export {
  createStorjTimelineService,
  getStorjTimelineService,
  StorjTimelineService,
  type BatchTimelineEventResult,
  type TimelineEventOptions,
  type TimelineEventResult,
} from "./StorjTimelineService";

export {
  createStorjConversationService,
  getStorjConversationService,
  StorjConversationService,
  type ConversationStorageOptions,
  type ConversationStorageResult,
} from "./StorjConversationService";

export {
  createStorjSyncService,
  getStorjSyncService,
  StorjSyncService,
  type SyncOptions,
  type SyncResult,
} from "./StorjSyncService";

export {
  getStorjReportService,
  StorjReportService,
  type ReportStorageOptions,
  type ReportStorageResult,
} from "./StorjReportService";

export {
  AttestationService,
  attestationAbi,
  type AttestationInput,
  type AttestationResult,
  type AttestationVerification,
  type OnChainAttestation,
} from "./AttestationService";
