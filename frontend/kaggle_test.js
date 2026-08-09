const https = require('https');
const url = 'https://www.kaggle.com/api/v1/datasets/list?search=brain';
const options = {
  headers: {
    'User-Agent': 'Mozilla/5.0',
    'Accept': 'application/json'
  }
};

const req = https.get(url, options, (res) => {
  console.log('STATUS', res.statusCode);
  console.log('CTYPE', res.headers['content-type']);
  let body = '';
  res.on('data', (chunk) => { body += chunk; });
  res.on('end', () => {
    console.log('BODY_START', body.slice(0, 1000));
  });
});

req.on('error', (e) => {
  console.error('ERR', e);
});
