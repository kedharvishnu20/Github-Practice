/**
 * Job Checkpoint
 * Manages job checkpoints for resume/retry functionality
 */

import Logger from '../shared/logger.js';

const logger = new Logger({ module: 'job-checkpoint' });

export class JobCheckpoint {
  constructor() {
    this.storageKey = 'scrape_checkpoints';
    this.maxCheckpoints = 10;
  }

  /**
   * Save a checkpoint
   */
  async save(checkpoint) {
    try {
      const result = await chrome.storage.local.get([this.storageKey]);
      const checkpoints = result[this.storageKey] || {};

      // Store checkpoint by job ID
      checkpoints[checkpoint.jobId] = {
        ...checkpoint,
        savedAt: Date.now()
      };

      await chrome.storage.local.set({ [this.storageKey]: checkpoints });
      
      logger.debug('Checkpoint saved', { 
        jobId: checkpoint.jobId, 
        stepIndex: checkpoint.stepIndex 
      });

      return true;
    } catch (error) {
      logger.error('Failed to save checkpoint', { error: error.message });
      return false;
    }
  }

  /**
   * Get checkpoint for a job
   */
  async get(jobId) {
    try {
      const result = await chrome.storage.local.get([this.storageKey]);
      const checkpoints = result[this.storageKey] || {};
      
      return checkpoints[jobId] || null;
    } catch (error) {
      logger.error('Failed to get checkpoint', { error: error.message });
      return null;
    }
  }

  /**
   * Clear checkpoint for a job
   */
  async clear(jobId) {
    try {
      const result = await chrome.storage.local.get([this.storageKey]);
      const checkpoints = result[this.storageKey] || {};

      if (checkpoints[jobId]) {
        delete checkpoints[jobId];
        await chrome.storage.local.set({ [this.storageKey]: checkpoints });
        
        logger.debug('Checkpoint cleared', { jobId });
      }

      return true;
    } catch (error) {
      logger.error('Failed to clear checkpoint', { error: error.message });
      return false;
    }
  }

  /**
   * Clear all checkpoints
   */
  async clearAll() {
    try {
      await chrome.storage.local.remove([this.storageKey]);
      logger.info('All checkpoints cleared');
      return true;
    } catch (error) {
      logger.error('Failed to clear all checkpoints', { error: error.message });
      return false;
    }
  }

  /**
   * List all checkpoints
   */
  async list() {
    try {
      const result = await chrome.storage.local.get([this.storageKey]);
      const checkpoints = result[this.storageKey] || {};
      
      return Object.entries(checkpoints).map(([jobId, checkpoint]) => ({
        jobId,
        stepIndex: checkpoint.stepIndex,
        savedAt: checkpoint.savedAt,
        paused: checkpoint.paused
      }));
    } catch (error) {
      logger.error('Failed to list checkpoints', { error: error.message });
      return [];
    }
  }

  /**
   * Check if job has checkpoint
   */
  async exists(jobId) {
    const checkpoint = await this.get(jobId);
    return checkpoint !== null;
  }

  /**
   * Get checkpoint age in milliseconds
   */
  async getAge(jobId) {
    const checkpoint = await this.get(jobId);
    
    if (!checkpoint) {
      return null;
    }

    return Date.now() - checkpoint.savedAt;
  }

  /**
   * Clean up old checkpoints
   */
  async cleanup(maxAge = 86400000) { // Default: 24 hours
    try {
      const result = await chrome.storage.local.get([this.storageKey]);
      const checkpoints = result[this.storageKey] || {};
      const now = Date.now();
      let cleaned = 0;

      for (const [jobId, checkpoint] of Object.entries(checkpoints)) {
        if (now - checkpoint.savedAt > maxAge) {
          delete checkpoints[jobId];
          cleaned++;
        }
      }

      if (cleaned > 0) {
        await chrome.storage.local.set({ [this.storageKey]: checkpoints });
        logger.info('Cleaned up old checkpoints', { count: cleaned });
      }

      return cleaned;
    } catch (error) {
      logger.error('Failed to cleanup checkpoints', { error: error.message });
      return 0;
    }
  }
}

export default JobCheckpoint;
