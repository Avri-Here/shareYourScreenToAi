# 🎬 Gemini Video Understanding - Demo App

A simple Windows app demonstrating Gemini AI video analysis, inspired by Sveta Morag’s article *Video Understanding with Gemini: Notes From the Field*.

## 🚀 Quick install (Windows)

### Option 1: Automatic script (easiest)

1. **Open PowerShell as Administrator**
2. **Run:**
   ```powershell
   cd gemini-video-demo
   .\install.ps1
   ```

The script installs Node.js, npm packages, and the app.

### Option 2: Manual install

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

## 💡 Example prompts

### Customer support calls

```
Describe this call. Identify:
1. What is the customer’s issue?
2. Did the agent respond well?
3. What extra information would help?
```

### Meetings

```
Summarize the meeting including:
- Main topics
- Decisions made
- Action items
Include timestamps.
```

### Tutorials

```
Create a step-by-step guide from this video with accurate timestamps.
```

### Specific moments

```
Find moments where the customer shows frustration or dissatisfaction.
```

## 📊 Understanding the output

The app shows:

- **Analysis** — with formatted timestamps
- **Processing time**
- **Tokens used**
- **Estimated cost** (USD)

### Sample output

```
🕐 00:15 - Customer describes the issue: internet down for two days
🕐 00:32 - Agent asks for account number
🕐 00:45 - Customer says they already tried reset three times
🕐 01:12 - Agent offers sending a technician
```

## 💰 Cost estimates (March 2026)

| Model | 5 min file (LOW res) | 5 min file (HIGH res) |
|------|----------------------|------------------------|
| Gemini 3 Flash | ~$0.02 | ~$0.08 |
| Gemini 3.1 Pro | ~$0.15 | ~$0.60 |
| Gemini 2.5 Pro | ~$0.30 | ~$1.20 |

**Tip:** Start with Flash + LOW resolution for testing.

## 🔧 Troubleshooting

### “Invalid API key”

- Copy the full key (long string of letters and numbers)
- Confirm the key is active at https://aistudio.google.com/

### “File too large”

- Trim the video into shorter clips
- Compress with HandBrake or similar
- Or use a YouTube URL instead

### “Slow”

- Try Gemini 3 Flash
- Lower resolution to LOW
- Use a shorter clip

### “Network error”

- Check your connection
- Restart the app
- Try a VPN if your region is restricted

## 🎓 Resources

- [Sveta Morag's Article](https://medium.com/google-cloud/video-understanding-with-gemini-notes-from-the-field-82dd0cd130ea)
- [Gemini API Documentation](https://ai.google.dev/gemini-api/docs/video-understanding)
- [Google AI Studio](https://aistudio.google.com/)
- [Gemini Pricing](https://ai.google.dev/pricing)

## 📝 Practical use cases

### 1. Agent assist (support)

- Analyze customer calls
- Find coaching opportunities
- Suggest replies for agents

### 2. Meeting analysis

- Automatic summaries
- Decisions and tasks
- Timestamps for replay

### 3. Training and learning

- Guides from training videos
- Critical steps
- Knowledge base content

### 4. Quality assurance

- Review agent conversations
- Compliance checks
- Customer satisfaction signals

## 🔐 Security and privacy

- The API key is stored **locally** on your machine
- Video is sent to the Google Gemini API
- Google may retain logs for a limited time
- Do not upload highly sensitive or secret content

## 🛠️ Development

To extend the app:

```bash
# Add features in renderer.js (logic) and index.html (UI)

# Build for distribution
npm run build
```

## 📞 Support

If something fails:

- Open DevTools (F12) and check the Console
- Try another or shorter video

---

**Created for:** NICE CXone team  
**Based on:** Sveta Morag's Video Understanding principles  
**Version:** 1.0.0
