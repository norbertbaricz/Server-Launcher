const https = require('https');
const fs = require('fs');
const urls = [
  'https://api.papermc.io/v3/projects/paper/versions',
  'https://papermc.io/api/v3/projects/paper/versions',
  'https://api.papermc.io/v3/projects/paper',
  'https://papermc.io/api/v3/projects/paper'
];
const headers = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  'Accept': 'application/json',
  'Referer': 'https://papermc.io/',
  'Origin': 'https://papermc.io',
  'Accept-Language': 'en-US,en;q=0.9'
};
function fetch(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers }, res => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ url, status: res.statusCode, headers: res.headers, body: data }));
    });
    req.on('error', err => reject(err));
  });
}
(async () => {
  const results = [];
  for (const url of urls) {
    try {
      const r = await fetch(url);
      results.push(r);
    } catch (e) {
      results.push({ url, error: e.message });
    }
  }
  fs.writeFileSync('papermc-test-result.json', JSON.stringify(results, null, 2), 'utf8');
})();
