# Dune Landsraad Screenshot Parser

A minimal screenshot upload analyzer for Dune Awakening Landsraad tasks. Upload a screenshot and let ChatGPT or Hugging Face AI extract task details.

## Features

- 📸 Screenshot upload form
- 🤖 Dual AI provider support:
  - **OpenAI**: gpt-4-vision (highest accuracy)
  - **Hugging Face**: llava-1.5-7b-hf (free alternative)
- 📋 Extracts: House name, contribution %, task type, rewards (solari, influence, op)
- 🔒 API keys handled server-side (secure)
- ⚡ Serverless deployment (Vercel)

## Local Development

### Prerequisites
- Node.js 18+
- API key from either:
  - OpenAI: https://platform.openai.com/api-keys
  - Hugging Face: https://huggingface.co/settings/tokens

### Setup

```bash
# Install dependencies
npm install

# Start dev server
npm run dev
```

Open http://localhost:3000 in your browser.

1. Select provider (OpenAI or Hugging Face)
2. Enter your API key
3. Upload a Landsraad task screenshot
4. Click "Analysieren" (Analyze)
5. View extracted JSON result

## Deployment to Vercel

### Step 1: Push to GitHub
```bash
git add .
git commit -m "Add Dune Landsraad screenshot parser"
git push origin main
```

### Step 2: Deploy on Vercel
1. Go to https://vercel.com/new
2. Import your GitHub repository
3. Click "Deploy"

### Step 3: Set Environment Variables (Optional)
If you want to provide API keys server-side (more secure):

In Vercel Dashboard → Settings → Environment Variables:
- `OPENAI_API_KEY`: Your OpenAI API key
- `HUGGINGFACE_API_KEY`: Your HF token

(Currently the app accepts keys from the browser UI for maximum flexibility)

## API Usage

The backend provides a `/api/analyze` POST endpoint:

```bash
curl -X POST http://localhost:3000/api/analyze \
  -H "Content-Type: application/json" \
  -d '{
    "imageDataUrl": "data:image/png;base64,...",
    "provider": "openai",
    "apiKey": "sk-..."
  }'
```

**Response (success):**
```json
{
  "result": {
    "house": "House Corrino",
    "personalContribution": 25,
    "task": {
      "type": "Assassination",
      "request": "Eliminate the spice merchant"
    },
    "rewards": {
      "solari": 5000,
      "influence": 10,
      "op": null,
      "otherItems": []
    }
  }
}
```

**Response (error):**
```json
{
  "error": "API key invalid",
  "raw": "..."
}
```

## Technical Stack

- **Frontend**: React 18 + Next.js 14
- **Backend**: Next.js API Routes (serverless)
- **Deployment**: Vercel
- **AI**: OpenAI gpt-4-vision or Hugging Face llava-1.5-7b-hf
- **Export**: Static HTML (no database needed)

## Notes

- All API keys are sent from browser to the `/api/analyze` endpoint (they're handled server-side only)
- Images are sent as base64 dataURLs (no file storage)
- Max 10 seconds execution time on Vercel Free (usually completes in 2-3s)
- No authentication required (fair use expected)

## License

MIT
