import { RagService } from './rag.service.js';

export class PageSuggesterService {
    constructor() {
        this.ragService = new RagService();
    }

    /**
     * Suggests relevant pages based on a query
     * @param {string} query - The search query
     * @param {number} limit - Maximum number of suggestions to return (default: 5)
     * @returns {Promise<Array<{source: string, score: number}>>} Array of suggested pages with their relevance scores
     */
    async suggestPages(query, limit = 5) {
        try {
            // Ensure content is loaded
            if (!this.ragService.vectorStore) {
                await this.ragService.loadContent();
            }

            // Get similar documents
            const relevantDocs = await this.ragService.vectorStore.similaritySearchWithScore(query, limit);

            // Transform results to include only unique pages with their best scores
            const pageScores = new Map();
            
            relevantDocs.forEach(([doc, score]) => {
                const source = doc.metadata.source.replace(/^.*?content\//, '').replace(/\.txt$/, '');
                // Keep the highest score for each unique page
                if (!pageScores.has(source) || score > pageScores.get(source).score) {
                    pageScores.set(source, { source, score });
                }
            });

            // Convert to array and sort by score
            return Array.from(pageScores.values())
                .sort((a, b) => b.score - a.score);
        } catch (error) {
            console.error('Error suggesting pages:', error);
            throw error;
        }
    }

    /**
     * Processes Q/A pairs and suggests relevant product pages
     * @param {Array<{question: string, answer: string, sources: Array<string>}>} qaPairs - Array of Q/A pairs with their sources
     * @returns {Promise<Array<{question: string, answer: string, sources: Array<string>, suggestedPages: Array<{source: string, score: number}>}>>}
     */
    async suggestProductPagesForQA(qaPairs) {
        try {
            // Ensure content is loaded
            if (!this.ragService.vectorStore) {
                await this.ragService.loadContent();
            }

            const processedQAs = await Promise.all(qaPairs.map(async (qa) => {
                // Get suggested pages for the question
                const suggestedPages = await this.suggestPages(qa.question, 5);

                // Filter to only product pages and exclude existing sources
                const filteredPages = suggestedPages.filter(page => {
                    const isProductPage = page.source.includes('/products');
                    const isNotExistingSource = !qa.sources.includes(page.source);
                    return isProductPage && isNotExistingSource;
                });

                // Add suggested pages to the QA object
                return {
                    ...qa,
                    suggestedPages: filteredPages
                };
            }));

            // Log the results
            console.log('Processed Q/A pairs with suggested product pages:');
            console.log(JSON.stringify(processedQAs, null, 2));

            return processedQAs;
        } catch (error) {
            console.error('Error processing Q/A pairs:', error);
            throw error;
        }
    }
} 