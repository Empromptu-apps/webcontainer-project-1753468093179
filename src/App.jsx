import React, { useState, useRef } from 'react';

const API_BASE = 'https://builder.empromptu.ai/api_tools';
const API_HEADERS = {
  'Content-Type': 'application/json',
  'Authorization': 'Bearer d4c03a1f5c51feec3ce1bfe53f835fe4',
  'X-Generated-App-ID': 'c295b820-f69c-473b-b70d-5453a5c2b11e',
  'X-Usage-Key': '53fb7507b246072e7bd6cc437b147808'
};

const WebScrapingApp = () => {
  const [darkMode, setDarkMode] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);
  const [csvFile, setCsvFile] = useState(null);
  const [csvHeaders, setCsvHeaders] = useState([]);
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [itemLimit, setItemLimit] = useState(50);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState('');
  const [scrapedData, setScrapedData] = useState([]);
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });
  const [apiLogs, setApiLogs] = useState([]);
  const [showApiLogs, setShowApiLogs] = useState(false);
  const [createdObjects, setCreatedObjects] = useState([]);
  const fileInputRef = useRef(null);

  const logApiCall = (method, endpoint, data, response) => {
    const log = {
      timestamp: new Date().toISOString(),
      method,
      endpoint,
      request: data,
      response
    };
    setApiLogs(prev => [...prev, log]);
  };

  const apiCall = async (endpoint, data) => {
    try {
      const response = await fetch(`${API_BASE}${endpoint}`, {
        method: 'POST',
        headers: API_HEADERS,
        body: JSON.stringify(data)
      });
      const result = await response.json();
      logApiCall('POST', endpoint, data, result);
      return result;
    } catch (error) {
      logApiCall('POST', endpoint, data, { error: error.message });
      throw error;
    }
  };

  const handleFileUpload = (file) => {
    setCsvFile(file);
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target.result;
      const lines = text.split('\n').filter(line => line.trim());
      if (lines.length > 0) {
        const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
        setCsvHeaders(headers);
      }
    };
    reader.readAsText(file);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.currentTarget.classList.add('drag-over');
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.currentTarget.classList.remove('drag-over');
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.currentTarget.classList.remove('drag-over');
    const files = e.dataTransfer.files;
    if (files.length > 0 && files[0].type === 'text/csv') {
      handleFileUpload(files[0]);
    }
  };

  const startExtraction = async () => {
    if (!csvFile || !websiteUrl.trim()) {
      alert('Please upload a CSV file and enter a website URL');
      return;
    }

    setCurrentStep(2);
    setIsProcessing(true);
    setProgress(0);
    setStatusMessage('Starting web scraping...');

    try {
      // Step 1: Input the website URL
      setProgress(25);
      setStatusMessage('Analyzing website structure...');
      
      const inputResult = await apiCall('/input_data', {
        created_object_name: 'website_data',
        data_type: 'urls',
        input_data: [websiteUrl]
      });
      
      setCreatedObjects(prev => [...prev, 'website_data']);

      // Step 2: Process the data with AI
      setProgress(50);
      setStatusMessage('Extracting product information...');

      const promptString = `
        Analyze the website data and extract product information. Organize the data according to these CSV columns: ${csvHeaders.join(', ')}.
        
        Instructions:
        - Extract up to ${itemLimit} products maximum
        - For each product, map the available information to the appropriate CSV columns
        - If information for a column is not available, use "N/A"
        - Focus on actual products, not navigation or promotional content
        - Return the data as a clean JSON array where each object represents one product
        - Use the exact column names as keys: ${csvHeaders.map(h => `"${h}"`).join(', ')}
        
        Website data: {website_data}
      `;

      const processResult = await apiCall('/apply_prompt', {
        created_object_names: ['extracted_products'],
        prompt_string: promptString,
        inputs: [{
          input_object_name: 'website_data',
          mode: 'combine_events'
        }]
      });

      setCreatedObjects(prev => [...prev, 'extracted_products']);

      // Step 3: Retrieve the processed data
      setProgress(75);
      setStatusMessage('Formatting results...');

      const dataResult = await apiCall('/return_data', {
        object_name: 'extracted_products',
        return_type: 'json'
      });

      setProgress(100);
      setStatusMessage('Extraction complete!');

      // Parse the JSON data
      let parsedData = [];
      try {
        if (typeof dataResult.value === 'string') {
          // Try to extract JSON from the string
          const jsonMatch = dataResult.value.match(/\[[\s\S]*\]/);
          if (jsonMatch) {
            parsedData = JSON.parse(jsonMatch[0]);
          } else {
            // Try parsing the entire string
            parsedData = JSON.parse(dataResult.value);
          }
        } else if (Array.isArray(dataResult.value)) {
          parsedData = dataResult.value;
        }
      } catch (e) {
        console.error('Error parsing data:', e);
        // Fallback: create sample data structure
        parsedData = [{
          error: 'Could not parse extracted data',
          raw_data: dataResult.value
        }];
      }

      setScrapedData(parsedData);
      setTimeout(() => {
        setCurrentStep(3);
        setIsProcessing(false);
      }, 1000);

    } catch (error) {
      console.error('Extraction error:', error);
      setStatusMessage('Error during extraction. Please try again.');
      setIsProcessing(false);
    }
  };

  const cancelExtraction = () => {
    setIsProcessing(false);
    setCurrentStep(1);
    setProgress(0);
    setStatusMessage('');
  };

  const handleSort = (key) => {
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const sortedData = React.useMemo(() => {
    if (!sortConfig.key) return scrapedData;
    
    return [...scrapedData].sort((a, b) => {
      const aVal = a[sortConfig.key] || '';
      const bVal = b[sortConfig.key] || '';
      
      if (sortConfig.direction === 'asc') {
        return aVal.toString().localeCompare(bVal.toString());
      }
      return bVal.toString().localeCompare(aVal.toString());
    });
  }, [scrapedData, sortConfig]);

  const downloadCSV = () => {
    if (!scrapedData.length) return;

    const csvContent = [
      csvHeaders.join(','),
      ...scrapedData.map(row => 
        csvHeaders.map(header => 
          `"${(row[header] || 'N/A').toString().replace(/"/g, '""')}"`
        ).join(',')
      )
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'scraped_products.csv';
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const deleteAllObjects = async () => {
    for (const objectName of createdObjects) {
      try {
        await fetch(`${API_BASE}/objects/${objectName}`, {
          method: 'DELETE',
          headers: API_HEADERS
        });
        logApiCall('DELETE', `/objects/${objectName}`, {}, { deleted: true });
      } catch (error) {
        logApiCall('DELETE', `/objects/${objectName}`, {}, { error: error.message });
      }
    }
    setCreatedObjects([]);
    alert('All created objects have been deleted');
  };

  const resetApp = () => {
    setCurrentStep(1);
    setCsvFile(null);
    setCsvHeaders([]);
    setWebsiteUrl('');
    setScrapedData([]);
    setSortConfig({ key: null, direction: 'asc' });
    setProgress(0);
    setStatusMessage('');
  };

  return (
    <div className={darkMode ? 'dark' : ''}>
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors duration-200">
        {/* Header */}
        <div className="bg-white dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-700">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center py-4">
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                Web Scraping & Data Organization Tool
              </h1>
              <div className="flex items-center space-x-4">
                <button
                  onClick={() => setShowApiLogs(!showApiLogs)}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                  aria-label="Toggle API logs"
                >
                  {showApiLogs ? 'Hide' : 'Show'} API Logs
                </button>
                {createdObjects.length > 0 && (
                  <button
                    onClick={deleteAllObjects}
                    className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                    aria-label="Delete all created objects"
                  >
                    Delete Objects
                  </button>
                )}
                <button
                  onClick={() => setDarkMode(!darkMode)}
                  className="p-2 rounded-lg bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                  aria-label="Toggle dark mode"
                >
                  {darkMode ? '☀️' : '🌙'}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* API Logs */}
        {showApiLogs && (
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
            <div className="bg-gray-800 text-green-400 p-4 rounded-lg font-mono text-sm max-h-96 overflow-y-auto">
              <h3 className="text-white mb-2">API Call Logs:</h3>
              {apiLogs.map((log, index) => (
                <div key={index} className="mb-4 border-b border-gray-700 pb-2">
                  <div className="text-yellow-400">{log.timestamp} - {log.method} {log.endpoint}</div>
                  <div className="text-blue-400">Request: {JSON.stringify(log.request, null, 2)}</div>
                  <div className="text-green-400">Response: {JSON.stringify(log.response, null, 2)}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Step 1: File Upload */}
          {currentStep === 1 && (
            <div className="space-y-8">
              <div className="text-center">
                <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">Upload & Configure</h2>
                <p className="text-gray-600 dark:text-gray-400">Upload your CSV template and configure scraping settings</p>
              </div>

              <div className="grid lg:grid-cols-2 gap-8">
                {/* CSV Upload Card */}
                <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-8">
                  <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-6">CSV Template</h3>
                  
                  <div
                    className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl p-8 text-center hover:border-primary-500 transition-colors cursor-pointer"
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <div className="text-4xl mb-4">📄</div>
                    <p className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                      Drop your CSV template here
                    </p>
                    <p className="text-gray-500 dark:text-gray-400 mb-4">
                      or click to browse files
                    </p>
                    <button
                      type="button"
                      className="px-6 py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors font-medium"
                      aria-label="Choose CSV file"
                    >
                      Choose File
                    </button>
                  </div>

                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv"
                    onChange={(e) => e.target.files[0] && handleFileUpload(e.target.files[0])}
                    className="hidden"
                    aria-label="CSV file input"
                  />

                  {csvFile && (
                    <div className="mt-6 p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
                      <p className="font-medium text-green-800 dark:text-green-400 mb-2">
                        ✅ {csvFile.name}
                      </p>
                      {csvHeaders.length > 0 && (
                        <div>
                          <p className="text-sm text-green-700 dark:text-green-300 mb-2">Headers detected:</p>
                          <div className="flex flex-wrap gap-2">
                            {csvHeaders.map((header, index) => (
                              <span
                                key={index}
                                className="px-3 py-1 bg-green-100 dark:bg-green-800 text-green-800 dark:text-green-200 rounded-full text-sm"
                              >
                                {header}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Configuration Card */}
                <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-8">
                  <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-6">Scraping Configuration</h3>
                  
                  <div className="space-y-6">
                    <div>
                      <label htmlFor="website-url" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Website URL
                      </label>
                      <input
                        id="website-url"
                        type="url"
                        value={websiteUrl}
                        onChange={(e) => setWebsiteUrl(e.target.value)}
                        placeholder="https://example.com"
                        className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                        aria-describedby="url-help"
                      />
                      <p id="url-help" className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                        Enter the website URL you want to scrape
                      </p>
                    </div>

                    <div>
                      <label htmlFor="item-limit" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Item Limit
                      </label>
                      <input
                        id="item-limit"
                        type="number"
                        min="1"
                        max="200"
                        value={itemLimit}
                        onChange={(e) => setItemLimit(parseInt(e.target.value) || 50)}
                        className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                        aria-describedby="limit-help"
                      />
                      <p id="limit-help" className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                        Maximum number of items to scrape (1-200)
                      </p>
                    </div>

                    <button
                      onClick={startExtraction}
                      disabled={!csvFile || !websiteUrl.trim()}
                      className="w-full px-6 py-4 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors font-medium text-lg"
                      aria-label="Start extraction process"
                    >
                      Start Extraction
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Processing */}
          {currentStep === 2 && (
            <div className="max-w-2xl mx-auto text-center">
              <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-12">
                <div className="mb-8">
                  <div className="w-16 h-16 mx-auto mb-6 text-primary-600">
                    <div className="w-full h-full border-4 border-primary-200 border-t-primary-600 rounded-full spinner"></div>
                  </div>
                  <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
                    Extracting Data
                  </h2>
                  <p className="text-gray-600 dark:text-gray-400 mb-8" aria-live="polite">
                    {statusMessage}
                  </p>
                </div>

                <div className="mb-8">
                  <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3">
                    <div
                      className="bg-primary-600 h-3 rounded-full transition-all duration-500"
                      style={{ width: `${progress}%` }}
                      role="progressbar"
                      aria-valuenow={progress}
                      aria-valuemin="0"
                      aria-valuemax="100"
                    ></div>
                  </div>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
                    {progress}% complete
                  </p>
                </div>

                <button
                  onClick={cancelExtraction}
                  className="px-6 py-3 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                  aria-label="Cancel extraction"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Results */}
          {currentStep === 3 && (
            <div className="space-y-8">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                  <h2 className="text-3xl font-bold text-gray-900 dark:text-white">
                    Extraction Results
                  </h2>
                  <p className="text-gray-600 dark:text-gray-400">
                    Found {scrapedData.length} items
                  </p>
                </div>
                <div className="flex flex-col sm:flex-row gap-3">
                  <button
                    onClick={downloadCSV}
                    disabled={!scrapedData.length}
                    className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors font-medium"
                    aria-label="Download results as CSV"
                  >
                    Download CSV
                  </button>
                  <button
                    onClick={resetApp}
                    className="px-6 py-3 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors font-medium"
                    aria-label="Start new extraction"
                  >
                    New Extraction
                  </button>
                </div>
              </div>

              {scrapedData.length > 0 && (
                <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="table table-striped table-hover w-100">
                      <thead className="bg-gray-50 dark:bg-gray-700">
                        <tr>
                          {csvHeaders.map((header) => (
                            <th
                              key={header}
                              className="px-6 py-4 text-left text-sm font-medium text-gray-900 dark:text-white cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors"
                              onClick={() => handleSort(header)}
                              role="columnheader"
                              tabIndex="0"
                              onKeyDown={(e) => e.key === 'Enter' && handleSort(header)}
                              aria-label={`Sort by ${header}`}
                            >
                              <div className="flex items-center space-x-2">
                                <span>{header}</span>
                                {sortConfig.key === header && (
                                  <span className="text-primary-600">
                                    {sortConfig.direction === 'asc' ? '↑' : '↓'}
                                  </span>
                                )}
                              </div>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                        {sortedData.map((row, index) => (
                          <tr key={index} className="hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                            {csvHeaders.map((header) => (
                              <td
                                key={header}
                                className="px-6 py-4 text-sm text-gray-900 dark:text-gray-300"
                              >
                                {row[header] || 'N/A'}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {scrapedData.length === 0 && (
                <div className="text-center py-12">
                  <div className="text-6xl mb-4">🔍</div>
                  <h3 className="text-xl font-medium text-gray-900 dark:text-white mb-2">
                    No data found
                  </h3>
                  <p className="text-gray-500 dark:text-gray-400">
                    The extraction process completed but no products were found. Try adjusting your settings or check the website URL.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default WebScrapingApp;
