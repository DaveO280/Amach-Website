/**
 * Storage module exports
 */

export {
  StorjClient,
  createStorjClient,
  type StorjConfig,
  type StorageReference,
  type UploadOptions,
  type DownloadResult,
} from "./StorjClient";

export {
  StorageService,
  createStorageService,
  getStorageService,
  type StoredHealthData,
  type RetrievedHealthData,
  type StoreOptions,
} from "./StorageService";
