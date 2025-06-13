import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { RagService } from './services/rag.service.js';
import PQueue from 'p-queue';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function testBulk() {
    const ragService = new RagService();
    await ragService.loadContent();

    const questionsPath = path.join(__dirname, '..', 'paa.txt');
    const questions = (await fs.readFile(questionsPath, 'utf-8')).split('\n').filter(q => q.trim());

    const queue = new PQueue({ concurrency: 10, interval: 1000, intervalCap: 10 });
    const results = [];

    for (const question of questions) {
        queue.add(async () => {
            console.log(`Processing question: ${question}`);
            try {
                const answer = await ragService.answerQuestions([question]);
                results.push(...answer);
            } catch (error) {
                results.push({ question, error: error.message });
            }
            console.log(`Progress: ${results.length}/${questions.length} questions processed`);
        });
    }

    await queue.onIdle();

    const outputPath = path.join(__dirname, '..', 'results.json');
    await fs.writeFile(outputPath, JSON.stringify(results, null, 2), 'utf-8');
    console.log(`Results saved to ${outputPath}`);
}

testBulk().catch(console.error); 