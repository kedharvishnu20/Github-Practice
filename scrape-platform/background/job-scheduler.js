/**
 * Job Scheduler
 * Manages job scheduling, queuing, and execution
 */

import { CONSTANTS } from '../shared/constants.js';
import { generateId } from '../shared/utils.js';
import Logger from '../shared/logger.js';

const logger = new Logger({ module: 'job-scheduler' });

class JobScheduler {
  constructor() {
    this.jobs = new Map();
    this.jobQueue = [];
    this.activeJobs = new Set();
    this.maxConcurrentJobs = 3;
    
    // Storage key for persistence
    this.storageKey = 'scrape_jobs';
    
    // Load persisted jobs on init
    this._loadJobs();
    
    // Set up alarm for job processing
    this._setupAlarms();
  }

  /**
   * Create a new job
   */
  async createJob(jobConfig) {
    const jobId = generateId('job_');
    
    const job = {
      id: jobId,
      status: CONSTANTS.JOB_STATUS.PENDING,
      config: jobConfig,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      startedAt: null,
      completedAt: null,
      progress: {
        current: 0,
        total: jobConfig.total || 0,
        percentage: 0
      },
      stats: {
        successCount: 0,
        failureCount: 0,
        retryCount: 0
      },
      errors: [],
      checkpoint: null
    };

    this.jobs.set(jobId, job);
    await this._saveJobs();
    
    // Add to queue
    this.jobQueue.push(jobId);
    
    logger.info('Job created', { 
      jobId, 
      url: jobConfig.url,
      type: jobConfig.type 
    });

    // Try to start if under concurrency limit
    this._processQueue();

    return jobId;
  }

  /**
   * Get job by ID
   */
  getJob(jobId) {
    return this.jobs.get(jobId);
  }

  /**
   * Update job status
   */
  async updateJobStatus(jobId, status, data = {}) {
    const job = this.jobs.get(jobId);
    if (!job) {
      logger.warn('Job not found', { jobId });
      return false;
    }

    job.status = status;
    job.updatedAt = Date.now();

    if (data.progress !== undefined) {
      job.progress = { ...job.progress, ...data.progress };
    }

    if (data.stats) {
      job.stats = { ...job.stats, ...data.stats };
    }

    if (data.error) {
      job.errors.push({
        timestamp: Date.now(),
        error: data.error
      });
    }

    if (data.checkpoint) {
      job.checkpoint = data.checkpoint;
    }

    if (status === CONSTANTS.JOB_STATUS.RUNNING && !job.startedAt) {
      job.startedAt = Date.now();
      this.activeJobs.add(jobId);
    }

    if ([CONSTANTS.JOB_STATUS.COMPLETED, CONSTANTS.JOB_STATUS.FAILED, CONSTANTS.JOB_STATUS.CANCELLED].includes(status)) {
      job.completedAt = Date.now();
      this.activeJobs.delete(jobId);
      
      // Remove from queue if present
      const queueIndex = this.jobQueue.indexOf(jobId);
      if (queueIndex > -1) {
        this.jobQueue.splice(queueIndex, 1);
      }
    }

    await this._saveJobs();
    
    logger.debug('Job updated', { jobId, status });

    // Process next job in queue
    this._processQueue();

    return true;
  }

  /**
   * Update job progress
   */
  async updateProgress(jobId, current, total) {
    const job = this.jobs.get(jobId);
    if (!job) return false;

    job.progress.current = current;
    job.progress.total = total;
    job.progress.percentage = total > 0 ? Math.round((current / total) * 100) : 0;
    job.updatedAt = Date.now();

    await this._saveJobs();
    return true;
  }

  /**
   * Pause a job
   */
  async pauseJob(jobId) {
    return this.updateJobStatus(jobId, CONSTANTS.JOB_STATUS.PAUSED);
  }

  /**
   * Resume a job
   */
  async resumeJob(jobId) {
    const job = this.jobs.get(jobId);
    if (!job || job.status !== CONSTANTS.JOB_STATUS.PAUSED) {
      return false;
    }

    job.status = CONSTANTS.JOB_STATUS.PENDING;
    this.jobQueue.push(jobId);
    await this._saveJobs();
    
    this._processQueue();
    return true;
  }

  /**
   * Cancel a job
   */
  async cancelJob(jobId) {
    const job = this.jobs.get(jobId);
    if (!job) return false;

    // Remove from queue
    const queueIndex = this.jobQueue.indexOf(jobId);
    if (queueIndex > -1) {
      this.jobQueue.splice(queueIndex, 1);
    }

    this.activeJobs.delete(jobId);
    return this.updateJobStatus(jobId, CONSTANTS.JOB_STATUS.CANCELLED);
  }

  /**
   * Process job queue
   */
  async _processQueue() {
    while (
      this.jobQueue.length > 0 &&
      this.activeJobs.size < this.maxConcurrentJobs
    ) {
      const jobId = this.jobQueue.shift();
      const job = this.jobs.get(jobId);

      if (job && job.status === CONSTANTS.JOB_STATUS.PENDING) {
        await this.updateJobStatus(jobId, CONSTANTS.JOB_STATUS.RUNNING);
        
        // Notify listeners
        this._notifyJobStart(job);
      }
    }
  }

  /**
   * Notify about job start (for UI updates)
   */
  _notifyJobStart(job) {
    if (typeof chrome !== 'undefined' && chrome.runtime) {
      chrome.runtime.sendMessage({
        type: CONSTANTS.MESSAGE_TYPES.JOB_UPDATE,
        job: {
          id: job.id,
          status: job.status,
          progress: job.progress
        }
      }).catch(() => {}); // Ignore if no listeners
    }
  }

  /**
   * Save jobs to storage
   */
  async _saveJobs() {
    try {
      const jobsArray = Array.from(this.jobs.values());
      await chrome.storage.local.set({ [this.storageKey]: jobsArray });
    } catch (error) {
      logger.error('Failed to save jobs', { error: error.message });
    }
  }

  /**
   * Load jobs from storage
   */
  async _loadJobs() {
    try {
      const result = await chrome.storage.local.get([this.storageKey]);
      const jobsArray = result[this.storageKey] || [];

      // Restore pending/running jobs
      for (const jobData of jobsArray) {
        if ([CONSTANTS.JOB_STATUS.PENDING, CONSTANTS.JOB_STATUS.RUNNING, CONSTANTS.JOB_STATUS.PAUSED].includes(jobData.status)) {
          // Reset running jobs to pending
          if (jobData.status === CONSTANTS.JOB_STATUS.RUNNING) {
            jobData.status = CONSTANTS.JOB_STATUS.PENDING;
          }
          
          this.jobs.set(jobData.id, jobData);
          
          if (jobData.status === CONSTANTS.JOB_STATUS.PENDING) {
            this.jobQueue.push(jobData.id);
          } else if (jobData.status === CONSTANTS.JOB_STATUS.PAUSED) {
            // Keep paused jobs but don't add to queue
          }
        }
      }

      logger.info('Jobs loaded', { count: this.jobs.size, queued: this.jobQueue.length });
    } catch (error) {
      logger.error('Failed to load jobs', { error: error.message });
    }
  }

  /**
   * Set up alarms for periodic processing
   */
  _setupAlarms() {
    if (typeof chrome !== 'undefined' && chrome.alarms) {
      chrome.alarms.create('jobProcessor', { periodInMinutes: 1 });
      
      chrome.alarms.onAlarm.addListener((alarm) => {
        if (alarm.name === 'jobProcessor') {
          this._processQueue();
        }
      });
    }
  }

  /**
   * Get all jobs
   */
  getAllJobs() {
    return Array.from(this.jobs.values());
  }

  /**
   * Get jobs by status
   */
  getJobsByStatus(status) {
    return this.getAllJobs().filter(job => job.status === status);
  }

  /**
   * Get active jobs
   */
  getActiveJobs() {
    return this.getJobsByStatus(CONSTANTS.JOB_STATUS.RUNNING);
  }

  /**
   * Get scheduler status
   */
  getStatus() {
    return {
      totalJobs: this.jobs.size,
      queuedJobs: this.jobQueue.length,
      activeJobs: this.activeJobs.size,
      maxConcurrent: this.maxConcurrentJobs,
      availableSlots: this.maxConcurrentJobs - this.activeJobs.size
    };
  }

  /**
   * Set max concurrent jobs
   */
  setMaxConcurrent(max) {
    this.maxConcurrentJobs = Math.max(1, max);
    this._processQueue();
  }

  /**
   * Clear completed jobs
   */
  async clearCompleted() {
    const completedJobs = this.getJobsByStatus(CONSTANTS.JOB_STATUS.COMPLETED);
    const failedJobs = this.getJobsByStatus(CONSTANTS.JOB_STATUS.FAILED);
    const cancelledJobs = this.getJobsByStatus(CONSTANTS.JOB_STATUS.CANCELLED);

    for (const job of [...completedJobs, ...failedJobs, ...cancelledJobs]) {
      this.jobs.delete(job.id);
    }

    await this._saveJobs();
    
    logger.info('Cleared completed jobs', { 
      cleared: completedJobs.length + failedJobs.length + cancelledJobs.length 
    });

    return {
      cleared: completedJobs.length + failedJobs.length + cancelledJobs.length
    };
  }
}

// Export singleton instance
export const jobScheduler = new JobScheduler();
export default JobScheduler;
