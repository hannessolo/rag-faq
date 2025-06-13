import { RagService } from './services/rag.service.js';
import dotenv from 'dotenv';

dotenv.config();

async function test() {
    console.log('Environment variables:');
    console.log('OLLAMA_BASE_URL:', process.env.OLLAMA_BASE_URL);
    console.log('EMBEDDING_MODEL:', process.env.EMBEDDING_MODEL);
    console.log('LLM_MODEL:', process.env.LLM_MODEL);

    try {
        // Initialize RAG service
        const ragService = new RagService({
            ollamaBaseUrl: process.env.OLLAMA_BASE_URL,
            embeddingModel: process.env.EMBEDDING_MODEL,
            llmModel: process.env.LLM_MODEL
        });

        // Load content
        console.log('Loading content...');
        const documentCount = await ragService.loadContent();
        console.log(`Loaded ${documentCount} documents`);

        // Test questions
        const questions = [
            "What exactly does creatine do to your body?",
            "Do creatine have side effects?",
            "What is the 3-3-3 rule gym?",
            "What is the difference between cats and dogs?",
        ];

        // Get answers
        console.log('\nGetting answers...');
        const results = await ragService.answerQuestions(questions);

        // Display results
        console.log('\nResults:');
        results.forEach(result => {
            console.log('\nQuestion:', result.question);
            if (result.error) {
                console.log('Error:', result.error);
            } else {
                console.log('Answer:', result.answer);
                console.log('Citations:', result.citations);
            }
            console.log('-'.repeat(80));
        });

    } catch (error) {
        console.error('Test failed:', error);
    }
}

test(); 