import { RagService } from '../services/rag.service.js';
import readline from 'readline';
import dotenv from 'dotenv';

dotenv.config();

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

async function main() {
    console.log('Initializing RAG service...');
    const ragService = new RagService();
    
    try {
        console.log('Loading content...');
        await ragService.loadContent();
        console.log('Content loaded successfully!');
        
        while (true) {
            const query = await new Promise(resolve => {
                rl.question('\nEnter your search query (or type "exit" to quit): ', resolve);
            });
            
            if (query.toLowerCase() === 'exit') {
                break;
            }
            
            console.log('\nSearching for similar documents...');
            const relevantDocs = await ragService.vectorStore.similaritySearch(query, 5);
            
            console.log('\nTop 5 most similar documents:');
            relevantDocs.forEach((doc, index) => {
                const source = doc.metadata.source.replace(/^.*?content\//, '').replace(/\.txt$/, '');
                console.log(`\n[${index + 1}] Source: ${source}`);
                // console.log('Content:', doc.pageContent);
                // console.log('---');
            });
        }
    } catch (error) {
        console.error('Error:', error);
    } finally {
        rl.close();
    }
}

main().catch(console.error); 