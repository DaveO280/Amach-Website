#!/bin/bash

echo "========================================"
echo "GRAEBER VIDEO GENERATOR"
echo "========================================"
echo ""
echo "Choose an option:"
echo ""
echo "1. Test API connection"
echo "2. Generate all assets (images + videos)"
echo "3. Assemble video (no audio)"
echo "4. Assemble video (with audio)"
echo "5. Full pipeline (generate + assemble)"
echo ""
read -p "Enter choice [1-5]: " choice

read -p "Enter your Venice API key: " VENICE_KEY

case $choice in
    1)
        python test_venice_api.py --venice-api-key "$VENICE_KEY"
        ;;
    2)
        python generate_graeber_video.py --venice-api-key "$VENICE_KEY"
        ;;
    3)
        python generate_graeber_video_full.py --venice-api-key "$VENICE_KEY" --skip-assets --assemble
        ;;
    4)
        read -p "Enter path to audio file: " AUDIO_PATH
        python generate_graeber_video_full.py --venice-api-key "$VENICE_KEY" --skip-assets --assemble --audio "$AUDIO_PATH"
        ;;
    5)
        python generate_graeber_video_full.py --venice-api-key "$VENICE_KEY" --assemble
        ;;
    *)
        echo "Invalid choice"
        ;;
esac
