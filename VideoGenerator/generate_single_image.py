#!/usr/bin/env python3
"""
Generate a single test image from Venice AI

Usage:
    python generate_single_image.py --venice-api-key YOUR_KEY --prompt "your prompt here"
"""

import argparse
import base64
import requests
from pathlib import Path

VENICE_API_BASE = "https://api.venice.ai/api/v1"

def generate_image(api_key: str, prompt: str, output_file: str = "test_output.png"):
    """Generate a single image"""
    
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    }
    
    # Try models in order - prioritizing quality and prompt adherence
    # nano-banana-pro: Best for photorealism and prompt adherence
    # hidream: Excellent prompt following
    # venice-sd35: Stable Diffusion 3.5 - high quality
    # qwen-image: Good general purpose
    # z-image-turbo: Fast but less detailed
    models = ["nano-banana-pro", "hidream", "venice-sd35", "qwen-image", "z-image-turbo"]
    
    for model in models:
        print(f"\nTrying model: {model}")
        print(f"Prompt: {prompt[:100]}...")
        
        payload = {
            "model": model,
            "prompt": prompt,
            "width": 1280,  # Max 1280 per Venice API limits
            "height": 720,   # 16:9 aspect ratio
            "return_binary": False
        }
        
        try:
            response = requests.post(
                f"{VENICE_API_BASE}/image/generate",
                headers=headers,
                json=payload,
                timeout=60
            )
            
            print(f"Status: {response.status_code}")
            
            if response.status_code == 429:
                print("Rate limited - wait a moment and try again")
                continue
                
            response.raise_for_status()
            
            data = response.json()
            print(f"Response keys: {list(data.keys())}")
            
            if "images" in data and len(data["images"]) > 0:
                image_data = base64.b64decode(data["images"][0])
                
                output_path = Path(output_file)
                output_path.write_bytes(image_data)
                
                print(f"\n✓ SUCCESS!")
                print(f"✓ Image saved to: {output_path.absolute()}")
                print(f"✓ Model used: {model}")
                print(f"✓ Size: {len(image_data) / 1024:.1f} KB")
                return True
            else:
                print(f"No images in response")
                continue
                
        except requests.exceptions.HTTPError as e:
            print(f"HTTP Error {e.response.status_code}: {e.response.text[:200]}")
            continue
        except Exception as e:
            print(f"Error: {e}")
            continue
    
    print("\n✗ All models failed")
    return False

def main():
    parser = argparse.ArgumentParser(description="Generate a single test image")
    parser.add_argument("--venice-api-key", required=True, help="Venice AI API key")
    parser.add_argument("--prompt", default="A beautiful sunset over mountains, cinematic, 16:9", help="Image prompt")
    parser.add_argument("--output", default="test_image.png", help="Output filename")
    
    args = parser.parse_args()
    
    print("="*60)
    print("SINGLE IMAGE TEST")
    print("="*60)
    
    generate_image(args.venice_api_key, args.prompt, args.output)

if __name__ == "__main__":
    main()