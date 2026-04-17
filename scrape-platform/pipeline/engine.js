/**
 * Pipeline Engine
 * Executes pipelines with checkpoint/resume support
 */

import { CONSTANTS } from '../shared/constants.js';
import Logger from '../shared/logger.js';
import { createNode } from './nodes.js';
import { JobCheckpoint } from '../checkpoint/job-checkpoint.js';

const logger = new Logger({ module: 'pipeline-engine' });

export class PipelineEngine {
  constructor(options = {}) {
    this.maxRetries = options.maxRetries || 3;
    this.retryDelay = options.retryDelay || 1000;
    this.timeout = options.timeout || 300000; // 5 minutes default
    
    this.checkpointManager = new JobCheckpoint();
    
    // Execution context
    this.context = {
      data: [],
      variables: {},
      errors: [],
      metadata: {}
    };
  }

  /**
   * Compile and execute a pipeline
   */
  async execute(pipeline, jobId = null) {
    const startTime = Date.now();
    
    logger.info('Pipeline execution started', { 
      pipelineName: pipeline.name,
      jobId 
    });

    try {
      // Initialize or restore from checkpoint
      if (jobId) {
        await this._restoreCheckpoint(jobId);
      }

      // Validate pipeline
      const validation = this._validatePipeline(pipeline);
      if (!validation.valid) {
        throw new Error(`Invalid pipeline: ${validation.errors.join(', ')}`);
      }

      // Create nodes
      const nodes = pipeline.steps.map(step => createNode(step));

      // Execute nodes
      let stepIndex = this.context._lastCompletedStep || 0;
      
      for (let i = stepIndex; i < nodes.length; i++) {
        const node = nodes[i];
        
        if (!node.enabled) {
          logger.debug('Skipping disabled node', { nodeId: node.id });
          continue;
        }

        logger.info('Executing node', { 
          nodeId: node.id, 
          nodeType: node.type,
          step: i + 1,
          total: nodes.length
        });

        try {
          // Check timeout
          if (Date.now() - startTime > this.timeout) {
            throw new Error('Pipeline execution timeout');
          }

          // Execute node
          const result = await this._executeWithRetry(node, i);
          
          // Update context
          this._updateContext(result, node);
          
          // Save checkpoint
          if (jobId) {
            await this._saveCheckpoint(jobId, pipeline, i, result);
          }

          // Handle conditional branching
          if (result.branchTo !== undefined) {
            i = result.branchTo - 1; // Will be incremented by loop
          }
        } catch (error) {
          logger.error('Node execution failed', { 
            nodeId: node.id, 
            error: error.message 
          });

          // Check if node has error handling
          if (node.config.onError === 'continue') {
            this.context.errors.push({
              step: i,
              nodeId: node.id,
              error: error.message
            });
            continue;
          } else if (node.config.onError === 'stop') {
            throw error;
          }

          // Default: rethrow
          throw error;
        }
      }

      const duration = Date.now() - startTime;
      
      logger.info('Pipeline execution completed', { 
        duration,
        recordsExtracted: this.context.data.length
      });

      // Clear checkpoint on success
      if (jobId) {
        await this.checkpointManager.clear(jobId);
      }

      return {
        success: true,
        duration,
        data: this.context.data,
        errors: this.context.errors,
        metadata: this.context.metadata
      };
    } catch (error) {
      logger.error('Pipeline execution failed', { error: error.message });
      
      return {
        success: false,
        error: error.message,
        partialData: this.context.data,
        errors: this.context.errors
      };
    }
  }

  /**
   * Execute a node with retry logic
   */
  async _executeWithRetry(node, stepIndex) {
    let lastError;
    
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        const result = await node.execute(this.context);
        node.status = 'completed';
        return result;
      } catch (error) {
        lastError = error;
        node.lastError = error.message;
        
        if (attempt < this.maxRetries) {
          logger.warn('Node execution retry', { 
            nodeId: node.id, 
            attempt,
            maxRetries: this.maxRetries,
            error: error.message 
          });
          
          await new Promise(resolve => 
            setTimeout(resolve, this.retryDelay * attempt)
          );
        }
      }
    }
    
    node.status = 'failed';
    throw lastError;
  }

  /**
   * Update execution context with node result
   */
  _updateContext(result, node) {
    // Merge data
    if (result.data) {
      if (Array.isArray(result.data)) {
        this.context.data.push(...result.data);
      } else {
        this.context.data.push(result.data);
      }
    }

    // Merge variables
    if (result.variables) {
      this.context.variables = { ...this.context.variables, ...result.variables };
    }

    // Store metadata
    this.context.metadata[`step_${node.id}`] = {
      type: node.type,
      executionTime: node.executionTime,
      status: node.status
    };

    // Track last completed step
    this.context._lastCompletedStep = parseInt(
      this.context.metadata[`step_${node.id}`]?.stepIndex || 0
    );
  }

  /**
   * Save checkpoint
   */
  async _saveCheckpoint(jobId, pipeline, stepIndex, result) {
    const checkpoint = {
      jobId,
      pipelineId: pipeline.id,
      stepIndex,
      timestamp: Date.now(),
      context: {
        dataCount: this.context.data.length,
        variables: this.context.variables,
        errors: this.context.errors
      },
      result
    };

    await this.checkpointManager.save(checkpoint);
  }

  /**
   * Restore from checkpoint
   */
  async _restoreCheckpoint(jobId) {
    const checkpoint = await this.checkpointManager.get(jobId);
    
    if (checkpoint) {
      logger.info('Restored from checkpoint', { 
        jobId, 
        stepIndex: checkpoint.stepIndex 
      });

      this.context._lastCompletedStep = checkpoint.stepIndex;
      this.context.variables = checkpoint.context?.variables || {};
      this.context.errors = checkpoint.context?.errors || [];
      
      // Note: We don't restore data to avoid duplicates
      // The pipeline should handle deduplication
    }
  }

  /**
   * Validate pipeline structure
   */
  _validatePipeline(pipeline) {
    const errors = [];

    if (!pipeline.steps || !Array.isArray(pipeline.steps)) {
      errors.push('Pipeline must have steps array');
      return { valid: false, errors };
    }

    if (pipeline.steps.length === 0) {
      errors.push('Pipeline must have at least one step');
    }

    // Validate each step
    for (let i = 0; i < pipeline.steps.length; i++) {
      const step = pipeline.steps[i];
      
      if (!step.type) {
        errors.push(`Step ${i}: missing type`);
        continue;
      }

      try {
        const node = createNode(step);
        const validation = node.validate();
        
        if (!validation.valid) {
          errors.push(`Step ${i} (${step.type}): ${validation.errors.join(', ')}`);
        }
      } catch (e) {
        errors.push(`Step ${i}: ${e.message}`);
      }
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Pause execution
   */
  async pause(jobId) {
    await this.checkpointManager.save({
      jobId,
      paused: true,
      timestamp: Date.now(),
      context: this.context
    });
  }

  /**
   * Resume execution
   */
  async resume(jobId, pipeline) {
    return this.execute(pipeline, jobId);
  }

  /**
   * Cancel execution
   */
  async cancel(jobId) {
    await this.checkpointManager.clear(jobId);
    this.context.errors.push({ type: 'cancelled', timestamp: Date.now() });
  }

  /**
   * Get execution status
   */
  getStatus() {
    return {
      dataCount: this.context.data.length,
      errorCount: this.context.errors.length,
      variables: Object.keys(this.context.variables),
      metadata: this.context.metadata
    };
  }

  /**
   * Reset context
   */
  reset() {
    this.context = {
      data: [],
      variables: {},
      errors: [],
      metadata: {}
    };
  }
}

export default PipelineEngine;
