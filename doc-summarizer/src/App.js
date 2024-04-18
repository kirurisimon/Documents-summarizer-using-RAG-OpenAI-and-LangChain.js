import React, { useState } from 'react';
import axios from 'axios';
import './App.css';

function App() {
  const [question, setQuestion] = useState('');
  const [result, setResult] = useState('');
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [fileList, setFileList] = useState([]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const response = await axios.post('http://localhost:30080/ask', {
        question: question || 'summarize',
        selectedFiles: selectedFiles,
      });
      setResult(response.data.kwargs.content);
    } catch (error) {
      console.error('Error:', error);
      setResult('An error occurred while processing your request.');
    }
  };

  const handleFileListLoad = async () => {
    try {
      const { data } = await axios.get('http://localhost:30080/files');
      setFileList(data.fileNames);
    } catch (error) {
      console.error('Error:', error);
    }
  };

  const handleFileSelection = (file) => {
    if (selectedFiles.includes(file)) {
      setSelectedFiles(selectedFiles.filter((f) => f !== file));
    } else {
      setSelectedFiles([...selectedFiles, file]);
    }
  };

  return (
    <div className="app-container">
      <header className="app-header">
        <h1 className="app-title">Documents Knowledge Base</h1>
      </header>
      <main className="app-main">
        <div className="side-panel">
          <h2>Available Documents</h2>
          <button onClick={handleFileListLoad}>Load File List</button>
          {fileList.map((file) => (
            <div key={file} className="document-item">
              <input
                type="checkbox"
                checked={selectedFiles.includes(file)}
                onChange={() => handleFileSelection(file)}
                id={`file-${file}`}
              />
              <label htmlFor={`file-${file}`}>{file}</label>
            </div>
          ))}
        </div>
        <div className="question-container">
          <form className="question-form" onSubmit={handleSubmit}>
            <input
              type="text"
              placeholder="Enter your instructions or click submit for a general summary"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              className="question-input"
            />
            <button type="submit" className="submit-button">
              Submit
            </button>
          </form>
          {result && (
            <div className="result-container">
              <h2 className="result-title">Result:</h2>
              <div className="result-content">{result}</div>
            </div>
          )}
        </div>
      </main>
      <footer className="app-footer">
        <p className="footer-text">© 2023 Documents Knowledge Base. All rights reserved.</p>
      </footer>
    </div>
  );
}

export default App;
