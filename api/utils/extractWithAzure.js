// Calls Azure Document Intelligence (prebuilt-read) to extract plain text
// from a PDF or image file. Returns a plain text string, or null if Azure
// credentials are missing or the call fails (graceful fallback to Claude-only).

import DocumentIntelligence, {
  isUnexpected,
  getLongRunningPoller,
} from '@azure-rest/ai-document-intelligence';
import fs from 'fs/promises';

const ENDPOINT = process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT;
const KEY      = process.env.AZURE_DOCUMENT_INTELLIGENCE_KEY;

export async function extractWithAzure(filePath) {
  if (!ENDPOINT || !KEY) return null;

  try {
    const client = DocumentIntelligence(ENDPOINT, { key: KEY });
    const base64Source = await fs.readFile(filePath, { encoding: 'base64' });

    const initialResponse = await client
      .path('/documentModels/{modelId}:analyze', 'prebuilt-read')
      .post({
        contentType: 'application/json',
        body: { base64Source },
      });

    if (isUnexpected(initialResponse)) {
      console.error('[Azure] Unexpected response:', initialResponse.body.error);
      return null;
    }

    const poller = getLongRunningPoller(client, initialResponse);
    const result = (await poller.pollUntilDone()).body;

    const pages = result?.analyzeResult?.pages ?? [];
    if (pages.length === 0) return null;

    const text = pages
      .map((page) => (page.lines ?? []).map((line) => line.content).join('\n'))
      .join('\n\n')
      .trim();

    return text.length > 0 ? text : null;

  } catch (err) {
    console.error('[Azure] Extraction failed, falling back to Claude-only:', err.message);
    return null;
  }
}
