import express from 'express';
import { z } from 'zod';
import dotenv from 'dotenv';
import { RagService } from './services/rag.service.js';

dotenv.config();

const app = express();
app.use(express.json());

// Initialize RAG service
const ragService = new RagService({
    ollamaBaseUrl: process.env.OLLAMA_BASE_URL,
    embeddingModel: process.env.EMBEDDING_MODEL,
    llmModel: process.env.LLM_MODEL
});

// Validation schemas
const questionsSchema = z.object({
    questions: z.array(z.string()).min(1)
});

// API Routes
app.post('/api/load-content', async (req, res) => {
    try {
        const documentCount = await ragService.loadContent();
        res.json({ 
            message: 'Content loaded successfully',
            documentCount 
        });
    } catch (error) {
        console.error('Error loading content:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/answer-questions', async (req, res) => {
    try {
        const { questions } = questionsSchema.parse(req.body);
        const results = await ragService.answerQuestions(questions);
        res.json({ results });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({ error: error.errors });
        }
        console.error('Error answering questions:', error);
        res.status(500).json({ error: error.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
}); 