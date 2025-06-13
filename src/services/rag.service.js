import { Document } from '@langchain/core/documents';
import { OllamaEmbeddings } from '@langchain/ollama';
import { Ollama } from '@langchain/ollama';
import { HNSWLib } from '@langchain/community/vectorstores/hnswlib';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class RagService {
    constructor() {
        this.embeddings = new OllamaEmbeddings({
            model: process.env.EMBEDDING_MODEL,
            baseUrl: process.env.OLLAMA_BASE_URL,
        });
        this.llm = new Ollama({
            model: process.env.LLM_MODEL,
            baseUrl: process.env.OLLAMA_BASE_URL,
        });
        this.vectorStore = null;
        this.vectorStorePath = path.join(__dirname, '..', '..', 'vectorstore');
    }

    async loadContent() {
        try {
            // Try to load existing vector store
            if (await this.loadVectorStore()) {
                console.log('Loaded existing vector store from disk');
                return;
            }
        } catch (error) {
            console.log('No existing vector store found, creating new one...');
        }

        // Create new vector store if loading failed
        const contentDir = path.join(__dirname, '..', '..', 'content');
        const documents = await this.loadDocumentsRecursively(contentDir);
        const splitter = new RecursiveCharacterTextSplitter({
            chunkSize: 1000,
            chunkOverlap: 200,
        });
        const splitDocs = await splitter.splitDocuments(documents);
        
        // Create and save new vector store
        this.vectorStore = await HNSWLib.fromDocuments(splitDocs, this.embeddings);
        await this.saveVectorStore();
        console.log(`Created and saved new vector store with ${documents.length} documents`);
    }

    async loadVectorStore() {
        try {
            await fs.access(this.vectorStorePath);
            this.vectorStore = await HNSWLib.load(this.vectorStorePath, this.embeddings);
            return true;
        } catch (error) {
            return false;
        }
    }

    async saveVectorStore() {
        if (!this.vectorStore) {
            throw new Error('No vector store to save');
        }
        await this.vectorStore.save(this.vectorStorePath);
    }

    async loadDocumentsRecursively(dir) {
        const documents = [];
        const entries = await fs.readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                const subDocs = await this.loadDocumentsRecursively(fullPath);
                documents.push(...subDocs);
            } else if (entry.isFile() && entry.name.endsWith('.txt')) {
                const content = await fs.readFile(fullPath, 'utf-8');
                documents.push(new Document({ pageContent: content, metadata: { source: fullPath } }));
            }
        }
        return documents;
    }

    async answerQuestions(questions) {
        if (!this.vectorStore) {
            throw new Error('Content not loaded. Call loadContent() first.');
        }

        const results = [];
        for (const question of questions) {
            try {
                const relevantDocs = await this.vectorStore.similaritySearch(question, 5);
                const context = relevantDocs.map((doc, index) => `Source ${index + 1}: ${doc.pageContent}`).join('\n\n');
                const promptTemplate = await fs.readFile(path.join(__dirname, '..', 'prompts', 'prompt.txt'), 'utf-8');
                const prompt = promptTemplate.replace('{context}', context).replace('{question}', question);
                const answer = await this.llm.call(prompt);
                const citations = relevantDocs.map(doc => doc.metadata.source);
                results.push({ question, answer, citations });
            } catch (error) {
                results.push({ question, error: error.message });
            }
        }
        return results;
    }
} 