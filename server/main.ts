import express from 'express';

const port = Number(process.env.PORT ?? 3001);
const app = express();

app.get('/health', (_request, response) => {
  response.json({ status: 'ok' });
});

app.listen(port, '127.0.0.1', () => {
  console.log(`Listening on http://127.0.0.1:${port}/health`);
});
