const express = require('express');
const cors = require('cors');
const fs = require('fs').promises;
const path = require('path');

const app = express();
const PORT = 3000;
const RESULTS_FILE = path.join(__dirname, 'results.json');

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('.')); // Serve static files

// Ensure results file exists
async function initResultsFile() {
    try {
        await fs.access(RESULTS_FILE);
    } catch {
        await fs.writeFile(RESULTS_FILE, JSON.stringify([]));
    }
}

// Get all results
app.get('/api/results', async (req, res) => {
    try {
        const data = await fs.readFile(RESULTS_FILE, 'utf8');
        res.json(JSON.parse(data));
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Save new result
app.post('/api/results', async (req, res) => {
    try {
        const results = JSON.parse(await fs.readFile(RESULTS_FILE, 'utf8'));
        results.push(req.body);
        await fs.writeFile(RESULTS_FILE, JSON.stringify(results, null, 2));
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Clear all results
app.delete('/api/results', async (req, res) => {
    try {
        await fs.writeFile(RESULTS_FILE, JSON.stringify([]));
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Start server
initResultsFile().then(() => {
    app.listen(PORT, () => {
        console.log(`Server running on https://blitzing-2.onrender.com`);
        console.log(`Results file: ${RESULTS_FILE}`);
    });
});
