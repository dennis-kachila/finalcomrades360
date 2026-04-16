const axios = require('axios');

async function test() {
    const baseUrl = 'http://localhost:4000/api';
    const endpoints = [
        '/pickup-stations',
        '/admin/delivery/agents/available/234'
    ];

    for (const endpoint of endpoints) {
        try {
            console.log(`Testing ${endpoint}...`);
            const res = await axios.get(`${baseUrl}${endpoint}`); // Note: Might need auth token if enforced
            console.log(`Success for ${endpoint}:`, res.status);
        } catch (err) {
            console.log(`Error for ${endpoint}:`, err.response?.status, JSON.stringify(err.response?.data, null, 2));
        }
    }
}

test();
