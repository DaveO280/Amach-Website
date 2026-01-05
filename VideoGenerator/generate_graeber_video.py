#!/usr/bin/env python3
"""
Automated Video Generation: Graeberian Money History → Amach Vision

This script generates a professional video explaining Graeber's monetary theory
and positioning Amach Health as a new paradigm for value-backed systems.

Usage:
    python generate_graeber_video.py --venice-api-key YOUR_KEY --output amach_vision.mp4
"""

import argparse
import json
import os
import time
from pathlib import Path
from typing import Dict, List, Optional
import requests
import base64

# Configuration
VENICE_API_BASE = "https://api.venice.ai/api/v1"
OUTPUT_DIR = Path("/home/claude/graeber_video")
ASSETS_DIR = OUTPUT_DIR / "assets"
IMAGES_DIR = ASSETS_DIR / "images"
VIDEOS_DIR = ASSETS_DIR / "videos"
AUDIO_DIR = ASSETS_DIR / "audio"

class ScriptSection:
    """Represents a section of the video script with timing and visual requirements"""
    def __init__(self, title: str, start_time: float, duration: float, narration: str, visual_type: str, prompt: str):
        self.title = title
        self.start_time = start_time
        self.duration = duration
        self.narration = narration
        self.visual_type = visual_type  # 'image' or 'video'
        self.prompt = prompt
        self.asset_path: Optional[Path] = None

# Define the complete video script with precise timing
VIDEO_SCRIPT: List[ScriptSection] = [
    ScriptSection(
        title="Opening",
        start_time=0,
        duration=10,
        narration="For thousands of years, we've told ourselves a story about money. A simple story. A wrong story.",
        visual_type="image",
        prompt="Ancient coins and scrolls on weathered parchment, dramatic lighting, cinematic, historical atmosphere, 16:9"
    ),
    ScriptSection(
        title="The Myth",
        start_time=10,
        duration=8,
        narration="The myth goes like this: primitive humans bartered. I'll trade you three chickens for that axe. But barter was clunky, so some genius invented money to solve the problem.",
        visual_type="image",
        prompt="Medieval marketplace illustration showing primitive barter, hand-drawn style, historical documentation feel, muted colors, 16:9"
    ),
    ScriptSection(
        title="Chicken Scene",
        start_time=18,
        duration=5,
        narration="Except... that never happened.",
        visual_type="video",
        prompt="Medieval peasant trying to trade live chickens with a blacksmith for an iron axe, frustrated, chickens escaping, comedic timing, cinematic lighting, 5 second duration, 16:9"
    ),
    ScriptSection(
        title="Graeber's Research",
        start_time=23,
        duration=12,
        narration="Anthropologist David Graeber spent years studying actual human societies. Barter between strangers? Rare. What he found instead: elaborate systems of social debt, mutual aid, 'I owe you' networks that maintained relationships.",
        visual_type="image",
        prompt="Anthropological research imagery, ancient debt tablets, community networks visualization, scholarly aesthetic, muted academic colors, 16:9"
    ),
    ScriptSection(
        title="Money's Purpose",
        start_time=35,
        duration=10,
        narration="Money wasn't invented to help communities cooperate. It was invented so states could provision armies and collect taxes from strangers. We built our entire economic system on a myth.",
        visual_type="image",
        prompt="Ancient army formations and tax collectors, historical documentation style, imposing architecture, power dynamics visualization, cinematic, 16:9"
    ),
    ScriptSection(
        title="Modern Abstraction",
        start_time=45,
        duration=12,
        narration="Today, money is backed by... what exactly? Government promises? Market confidence? The collective agreement that these numbers on screens mean something? We have financial instruments betting on other financial instruments. Derivatives of derivatives. Pure abstraction, untethered from anything real.",
        visual_type="image",
        prompt="Modern financial trading screens with stock market data, abstract numbers floating in digital space, disconnected from reality, cold blue lighting, 16:9"
    ),
    ScriptSection(
        title="Financial Glitch",
        start_time=57,
        duration=3,
        narration="",
        visual_type="video",
        prompt="Stock market charts and financial data dissolving into static and glitching, matrix-style corruption, numbers becoming meaningless, unsettling transformation, 3 second duration, 16:9"
    ),
    ScriptSection(
        title="Participation",
        start_time=60,
        duration=8,
        narration="And somehow, we all just... participate. We optimize our lives around maximizing these abstract points.",
        visual_type="image",
        prompt="People staring at smartphone screens showing stock tickers and financial apps, disconnected expressions, modern urban setting, cold tones, 16:9"
    ),
    ScriptSection(
        title="Health Data Locked",
        start_time=68,
        duration=12,
        narration="Meanwhile, something genuinely valuable sits locked away: your health data. Medical records scattered across systems. Lab results you can't access. Insights that could save your life, controlled by corporations extracting rent. The irony? We've abstracted value away from things that matter, while the most valuable data about YOU is inaccessible to you.",
        visual_type="image",
        prompt="Medical records behind locked corporate logos, scattered health data visualization, person reaching for their own information but blocked, dystopian healthcare system, 16:9"
    ),
    ScriptSection(
        title="Possibility",
        start_time=80,
        duration=10,
        narration="But what if we could build something different? Blockchain technology gets dismissed as 'just another financial speculation machine.' And sure, most of crypto is exactly that. But the technology offers something profound: verifiability. Auditability. Immutability.",
        visual_type="image",
        prompt="Clean geometric blockchain network visualization, crystalline structure, transparent and verifiable nodes, hopeful blue and white tones, technical but accessible, 16:9"
    ),
    ScriptSection(
        title="Order from Chaos",
        start_time=90,
        duration=4,
        narration="Not money 2.0. Economic coordination moored to actual reality.",
        visual_type="video",
        prompt="Geometric blockchain network forming from chaos, clean lines crystallizing, order emerging from disorder, hopeful but grounded, 4 second duration, 16:9"
    ),
    ScriptSection(
        title="Real Utility",
        start_time=94,
        duration=8,
        narration="What if instead of creating tokens backed by vibes, we created systems backed by real utility? By actual human needs?",
        visual_type="image",
        prompt="Human-centered technology interface, health data flowing to real people, warm tones contrasting with previous cold imagery, hope and agency, 16:9"
    ),
    ScriptSection(
        title="Amach Introduction",
        start_time=102,
        duration=12,
        narration="This is where Amach comes in. Your health data - genuinely valuable. Actually yours. A protocol that grows more valuable as more people contribute real data for real insights. Not speculation. Utility. Services built on a verifiable health commons that couldn't exist any other way.",
        visual_type="image",
        prompt="Clean health data dashboard showing Amach platform, user-controlled interface, transparent data flows, modern medical visualization, professional and trustworthy, 16:9"
    ),
    ScriptSection(
        title="Better Services",
        start_time=114,
        duration=12,
        narration="Better actuarial models because the data isn't corrupted by corporate incentives. AI health coaches trained on actual cohorts, not synthetic textbook garbage. Health outcomes tied to real information about real humans.",
        visual_type="image",
        prompt="Cohort analysis visualization, AI-assisted health insights, people benefiting from real data, network effects visualization, optimistic and grounded, 16:9"
    ),
    ScriptSection(
        title="Full Circle",
        start_time=126,
        duration=12,
        narration="Graeber showed us the original sin: we severed value from relationships, from reality itself. Blockchain gives us the tools to reconnect them. Amach is value moored to something concrete: human health. Your sovereignty. Our collective wellbeing.",
        visual_type="image",
        prompt="Person holding their complete health data securely, connected to community health network, full circle from opening imagery, warm human-centered tones, 16:9"
    ),
    ScriptSection(
        title="Closing",
        start_time=138,
        duration=7,
        narration="Not the future of money. The future of value.",
        visual_type="image",
        prompt="Amach Health logo on clean background with tagline 'Value Moored to Reality', professional, confident, simple and powerful, 16:9"
    ),
]

class VeniceAPIClient:
    """Client for interacting with Venice AI API"""
    
    def __init__(self, api_key: str):
        self.api_key = api_key
        self.headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json"
        }
    
    def generate_image(self, prompt: str, model: str = "nano-banana-pro") -> bytes:
        """Generate an image using Venice AI"""
        endpoint = f"{VENICE_API_BASE}/image/generate"
        
        # Try models in order - PRIORITIZING QUALITY & PROMPT FIDELITY
        # nano-banana-pro: $0.18 but best photorealism and prompt adherence
        # hidream: Excellent prompt following and detail
        # venice-sd35: SD 3.5 base, high quality
        # qwen-image: Strong general purpose
        # z-image-turbo: Fast fallback
        models_to_try = [
            "nano-banana-pro",
            "hidream", 
            "venice-sd35",
            "qwen-image",
            "z-image-turbo",
            model  # Try user's specified model last
        ]
        
        last_error = None
        for try_model in models_to_try:
            payload = {
                "model": try_model,
                "prompt": prompt,
                "width": 1280,  # Max width per Venice API
                "height": 720,   # 16:9 aspect ratio
                "return_binary": False
            }
            
            print(f"Trying {try_model}: {prompt[:50]}...")
            
            try:
                response = requests.post(endpoint, headers=self.headers, json=payload, timeout=60)
                response.raise_for_status()
                
                data = response.json()
                
                # Extract base64 image data
                if "images" in data and len(data["images"]) > 0:
                    base64_data = data["images"][0]
                    print(f"✓ Success with {try_model}")
                    return base64.b64decode(base64_data)
                else:
                    raise Exception("No image data returned")
                    
            except requests.exceptions.HTTPError as e:
                last_error = e
                if e.response.status_code == 404:
                    print(f"  Model {try_model} not found")
                    continue
                elif e.response.status_code == 429:
                    print(f"  Rate limited. Waiting 15 seconds...")
                    time.sleep(15)
                    # Retry same model
                    try:
                        response = requests.post(endpoint, headers=self.headers, json=payload, timeout=60)
                        response.raise_for_status()
                        data = response.json()
                        if "images" in data and len(data["images"]) > 0:
                            print(f"✓ Success with {try_model} after retry")
                            return base64.b64decode(data["images"][0])
                    except:
                        continue
                else:
                    print(f"  Error {e.response.status_code}")
                    continue
            except Exception as e:
                last_error = e
                print(f"  Error: {str(e)[:100]}")
                continue
        
        # If all models failed
        if last_error:
            raise last_error
        raise Exception("All image models failed")
    
    def generate_video(self, prompt: str, duration: int = 5) -> bytes:
        """Generate a video using Venice AI
        
        Uses actual Venice video models - prioritizing quality
        """
        endpoint = f"{VENICE_API_BASE}/video/generate"
        
        # Try video models in order of quality
        # Sora 2 Pro: OpenAI's best model (1080p)
        # Veo 3.1 Full: Google's highest quality
        # Kling 2.6 Pro: High quality option
        # Wan 2.6: Good all-around
        # LTX 2 Full: Solid quality
        models_to_try = [
            ("sora-2-pro-text-to-video", True),
            ("veo3.1-full-text-to-video", True),
            ("kling-2.6-pro-text-to-video", True),
            ("wan-2.6-text-to-video", True),
            ("ltx-2-full-text-to-video", True),
        ]
        
        last_error = None
        for model_id, supports_duration in models_to_try:
            payload = {
                "model": model_id,
                "prompt": prompt,
            }
            
            # Add duration if model supports it
            if supports_duration:
                payload["duration"] = duration
            
            print(f"Generating video with {model_id}: {prompt[:50]}...")
            
            try:
                response = requests.post(endpoint, headers=self.headers, json=payload, timeout=180)
                response.raise_for_status()
                
                data = response.json()
                
                # Video might return URL or base64 data - handle both
                if "video" in data:
                    if isinstance(data["video"], str):
                        if data["video"].startswith("http"):
                            video_response = requests.get(data["video"])
                            return video_response.content
                        else:
                            return base64.b64decode(data["video"])
                elif "url" in data:
                    video_response = requests.get(data["url"])
                    return video_response.content
                elif "videos" in data and len(data["videos"]) > 0:
                    # Handle array of videos
                    video_data = data["videos"][0]
                    if isinstance(video_data, str):
                        if video_data.startswith("http"):
                            video_response = requests.get(video_data)
                            return video_response.content
                        else:
                            return base64.b64decode(video_data)
                else:
                    raise Exception("No video data in response")
                    
            except requests.exceptions.HTTPError as e:
                last_error = e
                if e.response.status_code == 404:
                    print(f"  Model {model_id} not found, trying next...")
                    continue
                elif e.response.status_code == 429:
                    print(f"  Rate limited. Waiting 15 seconds...")
                    time.sleep(15)
                    continue
                else:
                    print(f"  Error {e.response.status_code}: {e.response.text[:200]}")
                    continue
            except Exception as e:
                last_error = e
                print(f"  Error with {model_id}: {e}")
                continue
        
        # If all video models failed, fall back to image
        print(f"Warning: All video models failed. Falling back to image generation...")
        return self.generate_image(prompt)

def setup_directories():
    """Create necessary output directories"""
    for dir_path in [OUTPUT_DIR, ASSETS_DIR, IMAGES_DIR, VIDEOS_DIR, AUDIO_DIR]:
        dir_path.mkdir(parents=True, exist_ok=True)

def generate_assets(api_key: str, script: List[ScriptSection]):
    """Generate all visual assets (images and videos)"""
    client = VeniceAPIClient(api_key)
    
    for i, section in enumerate(script):
        print(f"\n[{i+1}/{len(script)}] Processing: {section.title}")
        
        try:
            if section.visual_type == "image":
                image_data = client.generate_image(section.prompt)
                asset_path = IMAGES_DIR / f"{i:02d}_{section.title.lower().replace(' ', '_')}.png"
                asset_path.write_bytes(image_data)
                section.asset_path = asset_path
                print(f"✓ Image saved: {asset_path.name}")
                
            elif section.visual_type == "video":
                video_data = client.generate_video(section.prompt)
                asset_path = VIDEOS_DIR / f"{i:02d}_{section.title.lower().replace(' ', '_')}.mp4"
                asset_path.write_bytes(video_data)
                section.asset_path = asset_path
                print(f"✓ Video saved: {asset_path.name}")
            
            # Rate limiting - be respectful
            time.sleep(5)  # Increased from 2 to 5 seconds
            
        except Exception as e:
            print(f"✗ Error generating {section.visual_type} for {section.title}: {e}")
            print(f"  Continuing with remaining assets...")
            continue
    
    print("\n" + "="*60)
    print("Asset generation complete!")
    print(f"Images: {len(list(IMAGES_DIR.glob('*.png')))}")
    print(f"Videos: {len(list(VIDEOS_DIR.glob('*.mp4')))}")
    print("="*60)

def generate_voiceover(script: List[ScriptSection]):
    """Generate voiceover audio
    
    TODO: Integrate with ElevenLabs or similar TTS service
    For now, creates a placeholder audio file
    """
    print("\nVoiceover generation:")
    print("NOTE: Voiceover generation requires ElevenLabs API or similar TTS service")
    print("For now, you'll need to:")
    print("1. Record the narration yourself, OR")
    print("2. Use a TTS service with the script text")
    print("\nScript saved to: script.txt")
    
    # Save script for manual voiceover
    script_path = OUTPUT_DIR / "script.txt"
    with open(script_path, 'w') as f:
        for section in script:
            if section.narration:
                f.write(f"\n[{section.title}] ({section.duration}s)\n")
                f.write(f"{section.narration}\n")
    
    print(f"✓ Script text saved: {script_path}")

def assemble_video(script: List[ScriptSection], output_path: Path):
    """Assemble final video from assets
    
    TODO: Implement video assembly using moviepy
    Requires: pip install moviepy
    """
    print("\nVideo assembly:")
    print("NOTE: Video assembly requires moviepy library")
    print("Install with: pip install moviepy")
    print("\nYou can manually assemble the video using the assets in:")
    print(f"  Images: {IMAGES_DIR}")
    print(f"  Videos: {VIDEOS_DIR}")
    print(f"  Script: {OUTPUT_DIR}/script.txt")
    
    # Save assembly instructions
    instructions_path = OUTPUT_DIR / "assembly_instructions.md"
    with open(instructions_path, 'w') as f:
        f.write("# Video Assembly Instructions\n\n")
        f.write("## Timeline\n\n")
        for section in script:
            f.write(f"**{section.start_time}s - {section.start_time + section.duration}s**: {section.title}\n")
            f.write(f"- Visual: {section.visual_type}\n")
            if section.asset_path:
                f.write(f"- File: `{section.asset_path.name}`\n")
            f.write(f"- Narration: {section.narration}\n\n")
    
    print(f"✓ Assembly instructions saved: {instructions_path}")

def main():
    parser = argparse.ArgumentParser(description="Generate Graeberian money history video")
    parser.add_argument("--venice-api-key", required=True, help="Venice AI API key")
    parser.add_argument("--output", default="amach_vision.mp4", help="Output video filename")
    parser.add_argument("--skip-assets", action="store_true", help="Skip asset generation (use existing)")
    parser.add_argument("--skip-audio", action="store_true", help="Skip audio generation")
    
    args = parser.parse_args()
    
    print("="*60)
    print("GRAEBER VIDEO GENERATOR")
    print("Automated video creation for Amach Health vision")
    print("="*60)
    
    # Setup
    setup_directories()
    
    # Generate assets
    if not args.skip_assets:
        generate_assets(args.venice_api_key, VIDEO_SCRIPT)
    else:
        print("\nSkipping asset generation (using existing assets)")
    
    # Generate voiceover
    if not args.skip_audio:
        generate_voiceover(VIDEO_SCRIPT)
    else:
        print("\nSkipping audio generation")
    
    # Assemble video
    output_path = OUTPUT_DIR / args.output
    assemble_video(VIDEO_SCRIPT, output_path)
    
    print("\n" + "="*60)
    print("GENERATION COMPLETE!")
    print("="*60)
    print(f"\nAll assets saved to: {OUTPUT_DIR}")
    print("\nNext steps:")
    print("1. Review generated assets")
    print("2. Record/generate voiceover using script.txt")
    print("3. Use video editing software to assemble final video")
    print(f"4. Or install moviepy and extend this script to automate assembly")
    print("="*60)

if __name__ == "__main__":
    main()