const express = require('express');
const path = require('path');
const cors = require('cors');
const app = express();
const port = 30080;

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'build', 'index.html'));
});

app.get('/files', async (req, res) => {
  try {
    const { loadAndSplitChunks } = await import('./summarizer-core.mjs');
    const { documents, fileNames } = await loadAndSplitChunks({
      folderPath: './docs',
      chunkSize: 1536,
      chunkOverlap: 128,
      returnFileNames: true,
    });
    res.json({ documents, fileNames });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'An error occurred while fetching the file list.' });
  }
});

app.post('/ask', async (req, res) => {
  try {
    const { question, selectedFiles } = req.body;
    console.log('Received question:', question);
    console.log('Selected files:', selectedFiles);

    const { chatWithDocs } = await import('./summarizer-core.mjs');
    const result = await chatWithDocs(question, selectedFiles);
    console.log('Result:', result);
    res.json(result);
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'An error occurred while processing the request.' });
  }
});

app.use((err, req, res, next) => {
  console.error('Global error:', err.stack);
  res.status(500).json({ error: 'An unexpected error occurred.' });
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});