/**
 * Example Extraction Flow
 * Demonstrates how to use the ScrapePlatform programmatically
 */

// This example shows various ways to use the scraping platform

import SmartExtractor from '../content/extractor.js';
import PageAnalyzer from '../content/page-analyzer.js';
import LLMExtractor from '../ai/llm-extractor.js';
import PipelineEngine from '../pipeline/engine.js';

/**
 * Example 1: Simple DOM Extraction
 */
async function exampleSimpleExtraction() {
  const extractor = new SmartExtractor();
  
  // Extract single element
  const title = await extractor.extract('h1', { method: 'css' });
  console.log('Page Title:', title);
  
  // Extract multiple elements
  const links = await extractor.extract('a[href]', { 
    method: 'css', 
    multiple: true 
  });
  console.log('Links found:', links.length);
  
  // Extract with schema
  const article = await extractor.extract({
    title: 'h1',
    content: '.article-body',
    author: '.author-name',
    date: 'time[datetime]'
  });
  console.log('Article:', article);
}

/**
 * Example 2: Page Analysis
 */
async function examplePageAnalysis() {
  const analyzer = new PageAnalyzer();
  
  // Quick analysis
  const pageType = analyzer.detectPageType();
  console.log('Page Type:', pageType);
  
  // Full analysis
  const analysis = await analyzer.fullAnalysis();
  console.log('Full Analysis:', JSON.stringify(analysis, null, 2));
  
  // Check for pagination
  const pagination = analyzer.detectPagination();
  if (pagination.detected) {
    console.log('Pagination detected:', pagination);
  }
}

/**
 * Example 3: LLM-based Extraction
 */
async function exampleLLMExtraction() {
  const extractor = new LLMExtractor({
    provider: 'openai',
    model: 'gpt-4o-mini'
  });
  
  // Define schema
  const schema = {
    productName: { type: 'string', description: 'Name of the product' },
    price: { type: 'number', description: 'Product price' },
    description: { type: 'string', description: 'Product description' },
    features: { type: 'array', description: 'List of product features' },
    rating: { type: 'number', description: 'Average customer rating' }
  };
  
  try {
    const result = await extractor.extract(schema, {
      html: document.documentElement.outerHTML,
      url: window.location.href,
      useCache: true
    });
    
    console.log('LLM Extraction Result:', result);
  } catch (error) {
    console.error('LLM Extraction failed:', error.message);
  }
}

/**
 * Example 4: Pipeline Execution
 */
async function examplePipelineExecution() {
  const engine = new PipelineEngine({
    maxRetries: 3,
    timeout: 300000
  });
  
  // Define a simple pipeline
  const pipeline = {
    id: 'example-pipeline',
    name: 'Example Scraping Pipeline',
    steps: [
      {
        type: 'navigate',
        config: {
          url: 'https://example.com/products'
        }
      },
      {
        type: 'wait',
        config: {
          selector: '.products',
          duration: 2000
        }
      },
      {
        type: 'extract',
        config: {
          schema: {
            name: '.product-name',
            price: '.product-price'
          },
          multiple: true
        }
      },
      {
        type: 'transform',
        config: {
          operation: 'filter',
          script: 'item.price > 50'
        }
      }
    ]
  };
  
  // Execute pipeline
  const result = await engine.execute(pipeline);
  
  if (result.success) {
    console.log('Pipeline completed successfully');
    console.log('Extracted data:', result.data);
  } else {
    console.error('Pipeline failed:', result.error);
  }
}

/**
 * Example 5: Resume from Checkpoint
 */
async function exampleResumeFromCheckpoint() {
  const engine = new PipelineEngine();
  
  const pipeline = {
    id: 'resume-example',
    name: 'Resume Example',
    steps: [
      // ... steps definition
    ]
  };
  
  const jobId = 'job-12345';
  
  // First run - will create checkpoint
  let result = await engine.execute(pipeline, jobId);
  
  // If interrupted, resume from checkpoint
  if (!result.success) {
    console.log('Resuming from checkpoint...');
    result = await engine.resume(jobId, pipeline);
  }
}

/**
 * Example 6: Hybrid Extraction (Deterministic + LLM Fallback)
 */
async function exampleHybridExtraction() {
  const domExtractor = new SmartExtractor();
  const llmExtractor = new LLMExtractor();
  
  const schema = {
    title: 'h1',
    price: '.price'
  };
  
  // Try deterministic extraction first
  let data = await domExtractor.extract(schema);
  
  // If deterministic fails, fall back to LLM
  if (!data.title || !data.price) {
    console.log('Deterministic extraction incomplete, using LLM fallback...');
    
    data = await llmExtractor.extract({
      title: { type: 'string' },
      price: { type: 'number' }
    });
  }
  
  console.log('Final extracted data:', data);
}

/**
 * Example 7: Batch Processing with Rate Limiting
 */
async function exampleBatchProcessing() {
  const extractor = new SmartExtractor();
  const urls = [
    'https://example.com/product/1',
    'https://example.com/product/2',
    'https://example.com/product/3'
    // ... more URLs
  ];
  
  const results = [];
  
  for (const url of urls) {
    // Navigate to URL (in real implementation)
    // window.location.href = url;
    // await waitForLoad();
    
    // Extract data
    const data = await extractor.extract({
      name: '.product-name',
      price: '.product-price'
    });
    
    results.push({ url, ...data });
    
    // Rate limiting - wait between requests
    await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 1000));
  }
  
  console.log('Batch results:', results);
}

/**
 * Run all examples
 */
async function runAllExamples() {
  console.log('=== ScrapePlatform Examples ===\n');
  
  try {
    await exampleSimpleExtraction();
    console.log('\n---\n');
    
    await examplePageAnalysis();
    console.log('\n---\n');
    
    // Note: LLM examples require API key configuration
    // await exampleLLMExtraction();
    console.log('\n---\n');
    
    await examplePipelineExecution();
    console.log('\n---\n');
    
    await exampleHybridExtraction();
  } catch (error) {
    console.error('Example failed:', error);
  }
}

// Export examples for use
export {
  exampleSimpleExtraction,
  examplePageAnalysis,
  exampleLLMExtraction,
  examplePipelineExecution,
  exampleResumeFromCheckpoint,
  exampleHybridExtraction,
  exampleBatchProcessing,
  runAllExamples
};

// Run if executed directly
if (typeof window !== 'undefined') {
  window.ScrapePlatformExamples = {
    runAll: runAllExamples,
    simple: exampleSimpleExtraction,
    analysis: examplePageAnalysis,
    llm: exampleLLMExtraction,
    pipeline: examplePipelineExecution
  };
}
