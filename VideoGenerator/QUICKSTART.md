# 🚀 QUICK START GUIDE

## Get Your Video in 3 Steps

### Step 1: Test Your Setup (2 minutes)

```bash
python test_venice_api.py --venice-api-key YOUR_VENICE_KEY
```

This will:

- ✓ Verify your API key works
- ✓ Test image generation
- ✓ Check if video generation is available
- ✓ Create a test image

### Step 2: Generate Assets (10-15 minutes)

```bash
python generate_graeber_video.py --venice-api-key YOUR_VENICE_KEY
```

This will create:

- 13 high-quality images
- 3 video clips (if available, otherwise images)
- Full script text file
- Assembly instructions

**Expected output:**

```
/home/claude/graeber_video/
├── assets/
│   ├── images/  (13 images)
│   └── videos/  (3 videos)
├── script.txt
└── assembly_instructions.md
```

### Step 3: Assemble Video (5-10 minutes)

#### Option A: Automatic Assembly

```bash
python generate_graeber_video_full.py \
  --venice-api-key YOUR_KEY \
  --skip-assets \
  --assemble \
  --output amach_vision.mp4
```

#### Option B: With Voiceover

```bash
# First, record/generate voiceover using script.txt
# Then:
python generate_graeber_video_full.py \
  --venice-api-key YOUR_KEY \
  --skip-assets \
  --assemble \
  --audio path/to/voiceover.mp3 \
  --output amach_vision.mp4
```

#### Option C: Manual Assembly

1. Open `/home/claude/graeber_video/assembly_instructions.md`
2. Import assets into your video editor
3. Follow the timeline precisely
4. Add your voiceover
5. Export as MP4

---

## Common Issues

### "API key invalid"

- Get your key from: https://venice.ai/settings/api
- Make sure you have credits/Diem available

### "Video endpoint not found"

- Video generation may not be available yet
- Script will automatically fall back to images
- You can animate these images manually later

### "Rate limit exceeded"

- Wait a few minutes
- Or edit config.ini: `rate_limit_delay_seconds = 5`

### "Out of memory"

- Reduce threads in config.ini: `threads = 2`
- Or assemble video in sections

---

## What You Get

**Final Video Specs:**

- Duration: ~2:25 (145 seconds)
- Resolution: 1920x1080 (1080p)
- Frame rate: 30fps
- Format: MP4 (H.264)

**Content:**

- Professional narrative about money's mythology
- Smooth transitions between 16 sections
- Cinematic visuals from Venice AI
- Ready for voiceover addition

---

## Next Steps After Generation

1. **Add Voiceover**
   - Use script.txt
   - Record or use TTS (ElevenLabs recommended)
   - Sync with video timing

2. **Optional Enhancements**
   - Add subtle background music
   - Color grade for consistency
   - Add text overlays for key quotes
   - Include Amach branding

3. **Export & Share**
   - Upload to YouTube/Vimeo
   - Share on social media
   - Use for investor presentations

---

## Pro Tips

- **First time?** Start with just 3-5 sections to test workflow
- **Low credits?** Generate images first, videos can come later
- **Need changes?** Edit VIDEO_SCRIPT in the .py file
- **Want different style?** Modify prompts in the script

---

## Support

Questions? Check:

1. README.md - Full documentation
2. config.ini - All customization options
3. Venice AI docs - https://docs.venice.ai

---

**Ready to revolutionize how we think about value? Let's go! 🚀**
