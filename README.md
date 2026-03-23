# 🎬 Gemini Video Understanding - Demo App

A simple Windows app demonstrating Gemini AI video analysis, inspired by Sveta Morag’s article *Video Understanding with Gemini: Notes From the Field*.

## 🚀 Quick install (Windows)


###  Manual install

#### Step 1: Install Node.js

1. Download from https://nodejs.org/ (LTS)
2. Install with defaults
3. Verify:
   ```bash
   node --version
   npm --version
   ```

#### Step 2: Install dependencies

Open PowerShell/CMD in the project folder:

```bash
cd gemini-video-demo
npm install
```

#### Step 3: API key

Get a key from Google:

1. Go to https://aistudio.google.com/
2. Sign in with Google
3. Click **Get API Key**
4. Copy the key

## ▶️ Run the app

```bash
npm start
```

The app opens in an Electron window.

## 📖 Usage

### 1. API key

- Paste the API key in the field
- Click **Save** — it is stored for next time

### 2. Model

- **Gemini 3 Flash** — fast and cheap (good for tests)
- **Gemini 3.1 Pro** — higher quality
- **Gemini 2.5 Pro** — best quality (higher cost)

### 3. Cost settings

**Resolution:**

- Low — **~75% savings** (66 tokens/sec)
- Medium — balance (70 tokens/sec)
- High — maximum quality (258 tokens/sec)

**Thinking budget:**

- Low — simple questions
- Medium — most cases
- High — complex analysis

### 4. Load video

**Option A: Local file**

- Click **Select video file**
- Choose MP4, AVI, MOV, MKV, or WebM
- Recommended: up to ~50MB

**Option B: YouTube**

- Click **YouTube URL**
- Paste a public YouTube link

### 5. Analyze

- Pick an example prompt or write your own
- Click **Analyze video**
- Wait for results (often 10–60 seconds depending on length)

