import { Document } from '@langchain/core/documents';
import { OllamaEmbeddings } from '@langchain/ollama';
import { Ollama } from '@langchain/ollama';
import { OpenAIEmbeddings } from '@langchain/openai';
import { ChatOpenAI } from '@langchain/openai';
import { HNSWLib } from '@langchain/community/vectorstores/hnswlib';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class RagService {
    constructor() {
        // Initialize embeddings based on provider
        this.embeddings = this.getEmbeddings();
        this.llm = this.getLLM();
        this.vectorStore = null;
        this.vectorStorePath = path.join(__dirname, '..', '..', 'vectorstore');
    }

    getEmbeddings() {
        const provider = process.env.EMBEDDING_PROVIDER || 'ollama';
        
        if (provider === 'openai') {
            return new OpenAIEmbeddings({
                openAIApiKey: process.env.OPENAI_API_KEY,
                modelName: process.env.EMBEDDING_MODEL || 'text-embedding-3-small'
            });
        } else {
            return new OllamaEmbeddings({
                baseUrl: process.env.OLLAMA_BASE_URL,
                model: process.env.EMBEDDING_MODEL || 'nomic-embed-text',
            });
        }
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
            chunkSize: 800,
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
        const isChatModel = this.llm instanceof ChatOpenAI;
        for (const question of questions) {
            try {
                const relevantDocs = await this.vectorStore.similaritySearch(question, 5);
                const context = relevantDocs.map((doc, index) => {
                    const source = doc.metadata.source.replace(/^.*?content\//, '').replace(/\.txt$/, '');
                    return `==== Source ${index + 1} (https://bulk.com/${source}): === \n\n ${doc.pageContent} \n\n ======`;
                }).join('\n\n');
                const promptTemplate = await fs.readFile(path.join(__dirname, '..', 'prompts', 'prompt.txt'), 'utf-8');
                const prompt = promptTemplate.replace('{context}', context).replace('{question}', question);
                let answer;
                if (isChatModel) {
                    answer = await this.llm.invoke([
                        { role: 'system', content: prompt },
                        { role: 'user', content: `Please retrieve the information from the context and answer the question (${question}).` }
                    ]);
                    answer = answer.content;
                } else {
                    answer = await this.llm.call(prompt);
                }
                results.push(JSON.parse(answer));
            } catch (error) {
                results.push({ question, error: error.message });
            }
        }
        return results;
    }
} 