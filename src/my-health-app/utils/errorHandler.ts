/**
 * Central error handling utility for the health data application
 */

// Error types
export enum ErrorType {
    FILE_UPLOAD = 'FILE_UPLOAD',
    PARSING = 'PARSING',
    PROCESSING = 'PROCESSING',
    VALIDATION = 'VALIDATION',
    UNKNOWN = 'UNKNOWN'
  }
  
  // Error details interface
  export interface ErrorDetails {
    type: ErrorType;
    message: string;
    originalError?: unknown;
    timestamp: number;
    context?: Record<string, any>;
  }
  
  // Error logging function
  export const logError = (details: Omit<ErrorDetails, 'timestamp'>): ErrorDetails => {
    const error: ErrorDetails = {
      ...details,
      timestamp: Date.now()
    };
    
    // Log to console in development
    if (process.env.NODE_ENV !== 'production') {
      console.error(`[${error.type}] ${error.message}`, {
        originalError: error.originalError,
        context: error.context
      });
    }
    
    // In a real app, you might send this to an error reporting service
    
    return error;
  };
  
  // Helper for file upload errors
  export const handleFileUploadError = (error: unknown, context?: Record<string, any>): ErrorDetails => {
    const message = error instanceof Error ? error.message : 'Unknown file upload error';
    
    return logError({
      type: ErrorType.FILE_UPLOAD,
      message,
      originalError: error,
      context
    });
  };
  
  /**
   * Custom error class for health data processing errors
   */
  export class HealthDataError extends Error {
    constructor(message: string, public details?: Record<string, any>) {
      super(message);
      this.name = 'HealthDataError';
    }
  }
  
  /**
   * Handles parsing errors with consistent formatting and logging
   */
  export function handleParsingError(error: unknown, context?: Record<string, any>): HealthDataError {
    if (error instanceof HealthDataError) {
      return new HealthDataError(error.message, {
        ...error.details,
        ...context
      });
    }
  
    const message = error instanceof Error ? error.message : 'Error parsing health data';
    
    return new HealthDataError(message, {
      type: ErrorType.PARSING,
      originalError: error,
      context
    });
  }
  
  /**
   * Handles file validation errors
   */
  export function handleValidationError(file: File): HealthDataError {
    return new HealthDataError('Invalid health data file', {
      type: ErrorType.VALIDATION,
      fileName: file.name,
      fileType: file.type,
      fileSize: file.size
    });
  }
  
  /**
   * Handles data processing errors
   */
  export function handleProcessingError(error: unknown, context: Record<string, any>): HealthDataError {
    if (error instanceof HealthDataError) {
      return new HealthDataError(error.message, {
        ...error.details,
        ...context
      });
    }
  
    if (error instanceof Error) {
      return new HealthDataError('Error processing health data', {
        type: ErrorType.PROCESSING,
        message: error.message,
        stack: error.stack,
        ...context
      });
    }
  
    return new HealthDataError('Unknown error occurred while processing health data', {
      type: ErrorType.UNKNOWN,
      error,
      ...context
    });
  }
  
  /**
   * Helper to create a user-friendly error message
   */
  export const getUserFriendlyErrorMessage = (error: HealthDataError): string => {
    const type = error.details?.type as ErrorType;
    
    switch (type) {
      case ErrorType.FILE_UPLOAD:
        return 'There was a problem uploading your file. Please make sure it\'s a valid Apple Health export file.';
        
      case ErrorType.PARSING:
        return 'We had trouble reading your health data. The file might be corrupted or in an unexpected format.';
        
      case ErrorType.PROCESSING:
        return 'We encountered an issue while processing your health data. Please try again.';
        
      case ErrorType.VALIDATION:
        return 'Some of your health data doesn\'t appear to be valid or is in an unexpected format.';
        
      case ErrorType.UNKNOWN:
      default:
        return 'An unexpected error occurred. Please try again later.';
    }
  };