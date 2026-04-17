/**
 * Prompt Templates
 * Templates for LLM-based extraction
 */

export const PROMPT_TEMPLATES = {
  default: `You are a web scraping assistant. Extract data from the HTML according to the schema below.

SCHEMA:
{{SCHEMA}}

HTML CONTENT:
{{HTML}}

URL: {{URL}}

Instructions:
1. Extract ONLY the fields specified in the schema
2. Return valid JSON with no additional text
3. If a field cannot be found, set it to null
4. For arrays, extract all matching items
5. Do not include explanations or markdown formatting

Return the extracted data as JSON:`,

  openai: `You are a precise data extraction assistant. Analyze the following HTML and extract structured data according to the provided schema.

SCHEMA DEFINITION:
{{SCHEMA}}

WEB PAGE HTML:
{{HTML}}

SOURCE URL: {{URL}}

Requirements:
- Output MUST be valid JSON only (no markdown, no explanations)
- Match the exact field names from the schema
- Use null for missing/unavailable data
- Preserve data types (strings, numbers, arrays, objects)
- Clean whitespace from text values

JSON Output:`,

  anthropic: `I need you to extract structured information from an HTML document.

Here is the data schema I need you to follow:
<schema>
{{SCHEMA}}
</schema>

Here is the HTML content to analyze:
<html>
{{HTML}}
</html>

Source URL: {{URL}}

Please extract the data according to the schema. Important rules:
- Return ONLY valid JSON, nothing else
- Use the exact field names from the schema
- Set unavailable fields to null
- For list items, capture all instances
- Trim whitespace from text values

Your JSON response:`,

  google: `Extract structured data from HTML based on this schema:

Schema: {{SCHEMA}}

HTML: {{HTML}}

URL: {{URL}}

Output requirements:
- Valid JSON format only
- Exact schema field names
- null for missing data
- Arrays for repeated elements
- Clean text values

Extracted JSON:`
};

/**
 * System prompts for different extraction tasks
 */
export const SYSTEM_PROMPTS = {
  general: 'You are a helpful assistant that extracts structured data from HTML content.',
  
  product: `You are an e-commerce data extraction specialist. Extract product information accurately.
Key fields to look for:
- Product name/title
- Price (including currency)
- Description
- Images (URLs)
- Reviews/ratings
- Availability/stock status
- SKU/product ID`,

  article: `You are a content extraction specialist for articles and blog posts.
Key fields to look for:
- Article title
- Author name
- Publication date
- Main content body
- Tags/categories
- Featured image`,

  listing: `You are a data extraction specialist for listing/search results pages.
Key fields to look for:
- Item name/title
- Price
- Link/URL
- Image
- Rating/reviews
- Any relevant metadata`,

  contact: `You are a contact information extraction specialist.
Key fields to look for:
- Company name
- Address
- Phone number
- Email address
- Social media links
- Contact form fields`
};

/**
 * Few-shot examples for better LLM performance
 */
export const FEW_SHOT_EXAMPLES = {
  product: {
    input: `<div class="product">
      <h1>Wireless Headphones</h1>
      <span class="price">$99.99</span>
      <p>High-quality wireless headphones with noise cancellation.</p>
      <img src="/images/headphones.jpg" alt="Headphones">
      <span class="rating">4.5 stars</span>
    </div>`,
    output: `{
      "name": "Wireless Headphones",
      "price": "$99.99",
      "description": "High-quality wireless headphones with noise cancellation.",
      "image": "/images/headphones.jpg",
      "rating": "4.5 stars"
    }`
  },

  article: {
    input: `<article>
      <h1>The Future of AI</h1>
      <span class="author">By John Doe</span>
      <time datetime="2024-01-15">January 15, 2024</time>
      <div class="content">Artificial intelligence is rapidly evolving...</div>
    </article>`,
    output: `{
      "title": "The Future of AI",
      "author": "John Doe",
      "date": "2024-01-15",
      "content": "Artificial intelligence is rapidly evolving..."
    }`
  }
};

/**
 * Get template by provider
 */
export function getTemplate(provider = 'default') {
  return PROMPT_TEMPLATES[provider] || PROMPT_TEMPLATES.default;
}

/**
 * Get system prompt by type
 */
export function getSystemPrompt(type = 'general') {
  return SYSTEM_PROMPTS[type] || SYSTEM_PROMPTS.general;
}

export default {
  PROMPT_TEMPLATES,
  SYSTEM_PROMPTS,
  FEW_SHOT_EXAMPLES,
  getTemplate,
  getSystemPrompt
};
