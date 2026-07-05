const https = require('https');
const urls = [
  'https://api.papermc.io/v3/projects/paper/versions',
  'https://papermc.io/api/v3/projects/paper/versions',
  'https://api.papermc.io/v3/projects/paper',
  'https://papermc.io/api/v3/projects/paper'
];
const headers = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Referer': 'https://papermc.io/',
  'Origin': 'https://papermc.io'
};
function fetch(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers }, res => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ url, status: res.statusCode, headers: res.headers, body: data }));
    }).on('error', err => reject(err));
  });
}
(async () => {
  for (const url of urls) {
    try {
      const r = await fetch(url);
      console.log(`URL ${url}`);
      console.log(`STATUS ${r.status}`);
      console.log(`HEADERS ${JSON.stringify(r.headers, null, 2).slice(0, 300)}`);
      console.log(`BODY ${r.body.slice(0, 300).replace(/\n/g,' ')}`);
    } catch (e) {
      console.log(`ERROR ${url} ${e.message}`);
    }
    console.log('---');
  }
})();
