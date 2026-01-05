#!/usr/bin/env python3
"""
Quick test script to verify Venice API integration works

Usage:
    python test_venice_api.py --venice-api-key YOUR_KEY
"""

import argparse
import base64
import requests
from pathlib import Path

VENICE_API_BASE = "https://api.venice.ai/api/v1"

def test_image_generation(api_key: str):
    """Test basic image generation"""
    print("Testing image generation...")
    
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    }
    
    payload = {
        "model": "fluently-xl",
        "prompt": "A simple test image: beautiful sunset over mountains, cinematic, 16:9",
        "width": 1920,
        "height": 1080,
        "return_binary": False,
        "hide_watermark": True
    }
    
    try:
        response = requests.post(
            f"{VENICE_API_BASE}/image/generate",
            headers=headers,
            json=payload,
            timeout=60
        )
        response.raise_for_status()
        
        data = response.json()
        
        if "images" in data and len(data["images"]) > 0:
            print("✓ Image generation successful!")
            
            # Save test image
            image_data = base64.b64decode(data["images"][0])
            test_path = Path("/home/claude/test_image.png")
            test_path.write_bytes(image_data)
            print(f"✓ Test image saved to: {test_path}")
            
            return True
        else:
            print("✗ No image data in response")
            return False
            
    except requests.exceptions.RequestException as e:
        print(f"✗ Image generation failed: {e}")
        if hasattr(e, 'response') and e.response is not None:
            print(f"Response: {e.response.text}")
        return False

def test_video_generation(api_key: str):
    """Test video generation if available"""
    print("\nTesting video generation...")
    
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    }
    
    payload = {
        "model": "wan-2.5",
        "prompt": "A simple test video: waves crashing on a beach, 3 seconds, cinematic, 16:9",
        "width": 1920,
        "height": 1080,
    }
    
    try:
        response = requests.post(
            f"{VENICE_API_BASE}/video/generate",
            headers=headers,
            json=payload,
            timeout=120
        )
        response.raise_for_status()
        
        data = response.json()
        print("✓ Video generation endpoint exists!")
        print(f"Response structure: {list(data.keys())}")
        
        # Try to extract video data
        if "video" in data:
            print("✓ Video data field found")
        elif "url" in data:
            print("✓ Video URL field found")
        
        return True
        
    except requests.exceptions.HTTPError as e:
        if e.response.status_code == 404:
            print("⚠ Video endpoint not found (may not be available yet)")
            print("  The script will fall back to images for video sections")
        else:
            print(f"✗ Video generation failed: {e}")
            if hasattr(e, 'response') and e.response is not None:
                print(f"Response: {e.response.text}")
        return False
    except requests.exceptions.RequestException as e:
        print(f"✗ Video generation failed: {e}")
        return False

def test_api_key(api_key: str):
    """Test that API key is valid"""
    print("Testing API key...")
    
    headers = {
        "Authorization": f"Bearer {api_key}",
    }
    
    try:
        response = requests.get(
            f"{VENICE_API_BASE}/models",
            headers=headers,
            timeout=30
        )
        response.raise_for_status()
        
        print("✓ API key is valid!")
        data = response.json()
        
        if "data" in data:
            print(f"✓ Found {len(data['data'])} available models")
            
            # List some models
            print("\nAvailable models (sample):")
            for model in data['data'][:5]:
                model_id = model.get('id', 'unknown')
                print(f"  - {model_id}")
        
        return True
        
    except requests.exceptions.RequestException as e:
        print(f"✗ API key test failed: {e}")
        if hasattr(e, 'response') and e.response is not None:
            print(f"Response: {e.response.text}")
        return False

def main():
    parser = argparse.ArgumentParser(description="Test Venice AI API integration")
    parser.add_argument("--venice-api-key", required=True, help="Venice AI API key")
    
    args = parser.parse_args()
    
    print("="*60)
    print("VENICE API TEST")
    print("="*60)
    
    # Test API key
    if not test_api_key(args.venice_api_key):
        print("\n❌ API key test failed. Check your key and try again.")
        return
    
    print()
    
    # Test image generation
    if not test_image_generation(args.venice_api_key):
        print("\n❌ Image generation test failed.")
        return
    
    # Test video generation (may not be available)
    test_video_generation(args.venice_api_key)
    
    print("\n" + "="*60)
    print("✅ TESTS COMPLETE!")
    print("="*60)
    print("\nYou're ready to generate the Graeber video!")
    print("\nRun:")
    print(f"  python generate_graeber_video.py --venice-api-key {args.venice_api_key[:10]}...")
    print("\nOr for full automated assembly:")
    print(f"  python generate_graeber_video_full.py --venice-api-key {args.venice_api_key[:10]}... --assemble")
    print("="*60)

if __name__ == "__main__":
    main()
