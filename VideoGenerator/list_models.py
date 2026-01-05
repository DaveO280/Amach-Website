#!/usr/bin/env python3
"""
List all available Venice AI models

Usage:
    python list_models.py --venice-api-key YOUR_KEY
"""

import argparse
import requests
import json

VENICE_API_BASE = "https://api.venice.ai/api/v1"

def list_models(api_key: str):
    """List all available models"""
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
        
        data = response.json()
        
        if "data" not in data:
            print("No models data in response")
            return
        
        models = data["data"]
        
        print(f"\n{'='*60}")
        print(f"AVAILABLE VENICE AI MODELS ({len(models)} total)")
        print('='*60)
        
        # Separate by type
        image_models = []
        video_models = []
        text_models = []
        other_models = []
        
        for model in models:
            model_id = model.get('id', 'unknown')
            model_type = model.get('type', 'unknown')
            
            if 'image' in model_type.lower() or any(x in model_id.lower() for x in ['flux', 'stable', 'sd', 'image']):
                image_models.append(model)
            elif 'video' in model_type.lower() or any(x in model_id.lower() for x in ['video', 'sora', 'veo', 'wan', 'kling']):
                video_models.append(model)
            elif 'text' in model_type.lower() or 'completion' in model_type.lower():
                text_models.append(model)
            else:
                other_models.append(model)
        
        # Print image models
        print(f"\n📷 IMAGE MODELS ({len(image_models)}):")
        print("-" * 60)
        for model in image_models:
            model_id = model.get('id', 'unknown')
            print(f"  • {model_id}")
        
        # Print video models
        print(f"\n🎬 VIDEO MODELS ({len(video_models)}):")
        print("-" * 60)
        if video_models:
            for model in video_models:
                model_id = model.get('id', 'unknown')
                print(f"  • {model_id}")
        else:
            print("  (No video models found - may not be available yet)")
        
        # Print text models (first 10)
        print(f"\n💬 TEXT MODELS ({len(text_models)}, showing first 10):")
        print("-" * 60)
        for model in text_models[:10]:
            model_id = model.get('id', 'unknown')
            print(f"  • {model_id}")
        
        # Save full list to JSON
        output_file = "venice_models.json"
        with open(output_file, 'w') as f:
            json.dump(data, f, indent=2)
        
        print(f"\n{'='*60}")
        print(f"✓ Full model list saved to: {output_file}")
        print('='*60)
        
        # Recommendations
        print("\n📝 RECOMMENDED MODELS FOR GRAEBER VIDEO:")
        print("-" * 60)
        
        # Find best image model
        recommended_image = None
        for pref in ["flux-1.1-pro", "flux-schnell", "stable-diffusion-3-5-large", "fluently-xl"]:
            if any(pref in m.get('id', '') for m in image_models):
                recommended_image = pref
                break
        
        if recommended_image:
            print(f"  Image: {recommended_image}")
        else:
            print(f"  Image: {image_models[0].get('id') if image_models else 'NONE FOUND'}")
        
        # Find best video model
        recommended_video = None
        for pref in ["veo-3.1", "sora-2", "wan-2.5", "kling-2.5"]:
            if any(pref in m.get('id', '') for m in video_models):
                recommended_video = pref
                break
        
        if recommended_video:
            print(f"  Video: {recommended_video}")
        else:
            print(f"  Video: Video generation not available yet")
        
        print()
        
    except requests.exceptions.RequestException as e:
        print(f"Error listing models: {e}")
        if hasattr(e, 'response') and e.response is not None:
            print(f"Response: {e.response.text}")

def main():
    parser = argparse.ArgumentParser(description="List available Venice AI models")
    parser.add_argument("--venice-api-key", required=True, help="Venice AI API key")
    
    args = parser.parse_args()
    
    list_models(args.venice_api_key)

if __name__ == "__main__":
    main()
