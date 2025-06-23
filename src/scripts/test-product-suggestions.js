import { PageSuggesterService } from '../services/page-suggester.service.js';
import { RagService } from '../services/rag.service.js';
import dotenv from 'dotenv';

dotenv.config();

async function main() {
    console.log('Initializing services...');
    const ragService = new RagService();
    const suggester = new PageSuggesterService();

    await ragService.loadContent();
    
    try {
        // Example questions to test
        const questions = [
          "What exactly does creatine do to your body?",
          "Do creatine have side effects?",
          "Is weight gain a side effect of creatine?",
          "What is the 3-3-3 rule gym?",
          "Are there any special deals available for bulk products?"
        ];

        // Get answers from RAG service
        console.log('Getting answers from RAG service...');
        const qaPairs = await ragService.answerQuestions(questions);

        // Get product page suggestions
        console.log('\nGetting product page suggestions...');
        await suggester.suggestProductPagesForQA(qaPairs);

    } catch (error) {
        console.error('Error:', error);
    }
}

main().catch(console.error); 