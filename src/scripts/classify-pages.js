import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { Ollama } from '@langchain/ollama';
import { ChatOpenAI } from '@langchain/openai';
import { JsonOutputParser } from '@langchain/core/output_parsers';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Parse command line arguments
function parseArgs() {
    const args = process.argv.slice(2);
    const options = {
        limit: null
    };
    
    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--limit' || args[i] === '-l') {
            options.limit = parseInt(args[i + 1]);
            i++; // Skip the next argument since we consumed it
        } else if (args[i].startsWith('--limit=')) {
            options.limit = parseInt(args[i].split('=')[1]);
        } else if (args[i].startsWith('-l=')) {
            options.limit = parseInt(args[i].split('=')[1]);
        }
    }
    
    return options;
}

class PageClassifier {
    constructor(options = {}) {
        this.llm = this.getLLM();
        this.results = [];
        this.outputParser = new JsonOutputParser();
        this.limit = options.limit;

        console.log('LLM provider:', process.env.LLM_PROVIDER);
        console.log('LLM model:', process.env.LLM_MODEL);
    }

    getLLM() {
        const provider = process.env.LLM_PROVIDER || 'ollama';
        
        if (provider === 'openai') {
            return new ChatOpenAI({
                openAIApiKey: process.env.OPENAI_API_KEY,
                modelName: process.env.LLM_MODEL || 'gpt-4o-mini',
            });
        } else {
            return new Ollama({
                baseUrl: process.env.OLLAMA_BASE_URL,
                model: process.env.LLM_MODEL || 'Qwen2.5-7B-Instruct-1M-GGUF:Q8_0',
            });
        }
    }

    async loadClassificationPrompt() {
        const promptPath = path.join(__dirname, '..', 'prompts', 'prompt-page-classification.txt');
        return await fs.readFile(promptPath, 'utf-8');
    }

    async classifyPage(filePath, content) {
        try {
            const promptTemplate = await this.loadClassificationPrompt();
            const prompt = promptTemplate.replace('{context}', content);
            
            const isChatModel = this.llm instanceof ChatOpenAI;
            let response;
            
            if (isChatModel) {
                // For OpenAI models, use the output parser chain
                const chain = this.llm.pipe(this.outputParser);
                response = await chain.invoke([
                    { role: 'system', content: prompt },
                    { role: 'user', content: 'Please classify this page content.' }
                ]);
            } else {
                // For Ollama models, use the output parser directly
                response = await this.llm.call(prompt);
                response = await this.outputParser.parse(response);
            }

            // Handle the new response format with reasoning
            if (Array.isArray(response)) {
                // If it's an array of objects with page_types and reasoning
                if (response.length > 0 && response[0].page_types && response[0].reasoning) {
                    return response[0]; // Return the first object with page_types and reasoning
                }
                // If it's an array of strings (old format), convert to new format
                else if (typeof response[0] === 'string') {
                    return {
                        page_types: response,
                        reasoning: "Classified based on page content analysis"
                    };
                }
            } else if (typeof response === 'object' && response.page_types && response.reasoning) {
                // If it's already in the correct format
                return response;
            } else if (typeof response === 'string') {
                // If it's a single string, wrap it in the new format
                return {
                    page_types: [response],
                    reasoning: "Classified based on page content analysis"
                };
            } else {
                // If it's an object or other format, try to extract array
                return { 
                    page_types: [],
                    reasoning: `Raw response: ${JSON.stringify(response)}`
                };
            }
        } catch (error) {
            return { 
                page_types: [],
                reasoning: `Error: ${error.message}`
            };
        }
    }

    async loadDocumentsRecursively(dir) {
        const files = [];
        const entries = await fs.readdir(dir, { withFileTypes: true });
        
        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                const subFiles = await this.loadDocumentsRecursively(fullPath);
                files.push(...subFiles);
            } else if (entry.isFile() && entry.name.endsWith('.txt')) {
                files.push(fullPath);
            }
        }
        return files;
    }

    async classifyAllPages() {
        const contentDir = path.join(__dirname, '..', '..', 'content');
        const files = await this.loadDocumentsRecursively(contentDir);
        
        // Apply limit if specified
        const filesToProcess = this.limit ? files.slice(0, this.limit) : files;
        
        console.log(`Found ${files.length} files total`);
        if (this.limit) {
            console.log(`Processing ${filesToProcess.length} files (limited by --limit=${this.limit})`);
        } else {
            console.log(`Processing all ${filesToProcess.length} files`);
        }
        
        for (let i = 0; i < filesToProcess.length; i++) {
            const filePath = filesToProcess[i];
            const relativePath = filePath.replace(contentDir, '').replace(/^\/+/, '');
            
            console.log(`Classifying ${i + 1}/${filesToProcess.length}: ${relativePath}`);
            
            try {
                const content = await fs.readFile(filePath, 'utf-8');
                const classification = await this.classifyPage(filePath, content);
                
                this.results.push({
                    file: relativePath,
                    classification: classification,
                    timestamp: new Date().toISOString()
                });
                
                // Add a small delay to avoid overwhelming the LLM
                await new Promise(resolve => setTimeout(resolve, 100));
                
            } catch (error) {
                console.error(`Error processing ${relativePath}:`, error.message);
                this.results.push({
                    file: relativePath,
                    error: error.message,
                    timestamp: new Date().toISOString()
                });
            }
        }
    }

    // Convert file path to URL
    filePathToUrl(filePath) {
        // Remove .txt extension and convert to URL format
        const urlPath = filePath.replace(/\.txt$/, '');
        
        // Handle index files
        if (urlPath.endsWith('/index')) {
            return `https://www.bulk.com/${urlPath.replace('/index', '')}`;
        }
        
        return `https://www.bulk.com/${urlPath}`;
    }

    // Convert classification to string format
    classificationToString(classification) {
        if (classification && classification.page_types && Array.isArray(classification.page_types)) {
            return classification.page_types.join('; ');
        } else if (Array.isArray(classification)) {
            return classification.join('; ');
        } else if (typeof classification === 'string') {
            return classification;
        } else if (classification && classification.raw_response) {
            return classification.raw_response;
        } else if (classification && classification.error) {
            return `ERROR: ${classification.error}`;
        } else {
            return 'UNKNOWN';
        }
    }

    async saveResultsToCSV() {
        const outputPath = path.join(__dirname, '..', '..', 'page-classifications.csv');
        
        // Create CSV header
        let csvContent = 'url,page_type,reasoning\n';
        
        // Add each result as a CSV row
        for (const result of this.results) {
            const url = this.filePathToUrl(result.file);
            const pageType = this.classificationToString(result.classification);
            const reasoning = result.classification && result.classification.reasoning 
                ? result.classification.reasoning 
                : 'No reasoning provided';
            
            // Escape quotes and wrap in quotes if contains comma
            const escapedPageType = pageType.includes(',') ? `"${pageType.replace(/"/g, '""')}"` : pageType;
            const escapedReasoning = reasoning.includes(',') ? `"${reasoning.replace(/"/g, '""')}"` : reasoning;
            
            csvContent += `${url},${escapedPageType},${escapedReasoning}\n`;
        }
        
        await fs.writeFile(outputPath, csvContent, 'utf-8');
        console.log(`Results saved to: ${outputPath}`);
    }

    async generateSummary() {
        const classifications = this.results.filter(r => r.classification && r.classification.page_types);
        const summary = {
            total_files: this.results.length,
            successful_classifications: classifications.length,
            failed_classifications: this.results.length - classifications.length,
            classification_counts: {},
            files_by_type: {}
        };

        // Count classifications
        classifications.forEach(result => {
            const pageTypes = result.classification.page_types;
            if (Array.isArray(pageTypes)) {
                pageTypes.forEach(type => {
                    summary.classification_counts[type] = (summary.classification_counts[type] || 0) + 1;
                    if (!summary.files_by_type[type]) {
                        summary.files_by_type[type] = [];
                    }
                    summary.files_by_type[type].push(result.file);
                });
            }
        });

        const summaryPath = path.join(__dirname, '..', '..', 'classification-summary.json');
        await fs.writeFile(summaryPath, JSON.stringify(summary, null, 2), 'utf-8');
        console.log(`Summary saved to: ${summaryPath}`);
        
        // Print summary to console
        console.log('\n=== CLASSIFICATION SUMMARY ===');
        console.log(`Total files processed: ${summary.total_files}`);
        console.log(`Successful classifications: ${summary.successful_classifications}`);
        console.log(`Failed classifications: ${summary.failed_classifications}`);
        console.log('\nClassification counts:');
        Object.entries(summary.classification_counts)
            .sort(([,a], [,b]) => b - a)
            .forEach(([type, count]) => {
                console.log(`  ${type}: ${count}`);
            });
    }
}

async function main() {
    const options = parseArgs();
    
    console.log('Starting page classification...');
    if (options.limit) {
        console.log(`Limit set to ${options.limit} pages`);
    }
    
    const classifier = new PageClassifier(options);
    
    try {
        await classifier.classifyAllPages();
        await classifier.saveResultsToCSV();
        await classifier.generateSummary();
        
        console.log('Page classification completed successfully!');
    } catch (error) {
        console.error('Error during classification:', error);
        process.exit(1);
    }
}

// Run the script
main().catch(console.error);