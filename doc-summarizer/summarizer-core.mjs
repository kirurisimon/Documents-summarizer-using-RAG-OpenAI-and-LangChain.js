import { TextLoader } from "langchain/document_loaders/fs/text";
import { PDFLoader } from "langchain/document_loaders/fs/pdf";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import { OpenAIEmbeddings } from "@langchain/openai";
import { MemoryVectorStore } from "langchain/vectorstores/memory";
import dotenv from 'dotenv';
import { RunnableSequence } from "@langchain/core/runnables";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { ChatOpenAI } from "@langchain/openai";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { RunnablePassthrough } from "@langchain/core/runnables";
import fs from 'fs';
import path from 'path';

dotenv.config();

export async function loadAndSplitChunks({ folderPath, chunkSize, chunkOverlap, returnFileNames = false }) {
  const documents = [];
  const fileNames = [];
  const fileMap = new Map(); // Use a Map to store filenames and their corresponding documents

  const files = fs.readdirSync(folderPath);

  for (const file of files) {
    const filePath = path.join(folderPath, file);
    let rawContent;
    if (filePath.endsWith(".pdf")) {
      const loader = new PDFLoader(filePath);
      rawContent = await loader.load();
    } else if (filePath.endsWith(".txt")) {
      const loader = new TextLoader(filePath);
      rawContent = await loader.load();
    } else {
      console.log(`Skipping file: ${filePath} (Not a PDF or TXT)`);
      continue;
    }

    const splitter = new RecursiveCharacterTextSplitter({ chunkSize, chunkOverlap });
    const splitDoc = await splitter.splitDocuments(rawContent);
    documents.push(...splitDoc);
    fileNames.push(file);
    fileMap.set(file, splitDoc); // Store filename and its corresponding documents in the Map
  }

  if (returnFileNames) {
    return { documents, fileNames };
  } else {
    return { documents, fileMap }; // Return the Map along with the documents
  }
}

async function initializeVectorstoreWithDocuments({ documents }) {
  const embeddings = new OpenAIEmbeddings({
    openAIApiKey: process.env.OPENAI_API_KEY,
  });

  const vectorstore = new MemoryVectorStore(embeddings);
  await vectorstore.addDocuments(documents);
  return vectorstore;
}

function createDocumentRetrievalChain(retriever) {
  const convertDocsToString = (documents) => {
    return documents.map((document) => `<doc>\n${document.pageContent}\n</doc>`).join("\n");
  };

  const documentRetrievalChain = RunnableSequence.from([
    (input) => input.standalone_question,
    retriever,
    convertDocsToString,
  ]);

  return documentRetrievalChain;
}

function createRephraseQuestionChain() {
  const REPHRASE_QUESTION_SYSTEM_TEMPLATE = `
  meet the following objective to the best of your ability:
  `;

  const rephraseQuestionChainPrompt = ChatPromptTemplate.fromMessages([
    ["system", REPHRASE_QUESTION_SYSTEM_TEMPLATE],
    ["human", "Rephrase the following question as a standalone question:\n{question}"],
  ]);

  const rephraseQuestionChain = RunnableSequence.from([
    rephraseQuestionChainPrompt,
    new ChatOpenAI({
      openAIApiKey: process.env.OPENAI_API_KEY,
      maxTokens: 2048,
    }),
    new StringOutputParser(),
  ]);
  return rephraseQuestionChain;
}

const ANSWER_CHAIN_SYSTEM_TEMPLATE = `You are an experienced researcher,
interpret and answer the user's question using only the provided sources.
<context>
{context}
</context>
The user's question is: {standalone_question}`;

const answerGenerationChainPrompt = ChatPromptTemplate.fromMessages([
  ["system", ANSWER_CHAIN_SYSTEM_TEMPLATE],
  ["human", `Now, answer this question:\n{standalone_question}`],
]);

async function createConversationalRetrievalChain(retriever) {
  const rephraseQuestionChain = await createRephraseQuestionChain();

  const conversationalRetrievalChain = RunnableSequence.from([
    RunnablePassthrough.assign({
      standalone_question: rephraseQuestionChain,
    }),
    RunnablePassthrough.assign({
      context: createDocumentRetrievalChain(retriever),
    }),
    answerGenerationChainPrompt,
    new ChatOpenAI({
      openAIApiKey: process.env.OPENAI_API_KEY,
      maxTokens: 2048,
    }),
  ]);

  return conversationalRetrievalChain;
}

export async function chatWithDocs(question, selectedFiles) {
  const { documents, fileMap } = await loadAndSplitChunks({
    folderPath: './docs',
    chunkSize: 1536,
    chunkOverlap: 128,
  });

  const selectedDocuments = [];
  for (const file of selectedFiles) {
    if (fileMap.has(file)) {
      selectedDocuments.push(...fileMap.get(file));
    }
  }

  const selectedDocumentContent = selectedDocuments.map((doc) => doc.pageContent).join('\n');

  const vectorstore = await initializeVectorstoreWithDocuments({
    documents: selectedDocuments,
  });

  const retriever = vectorstore.asRetriever();
  console.log('Selected document content:', selectedDocumentContent);
  const finalRetrievalChain = await createConversationalRetrievalChain(retriever);

  const result = await finalRetrievalChain.invoke({
    question: question,
    context: selectedDocumentContent,
  });

  return result;
}
