#!/usr/bin/env python3
"""
ENHANCED: Automated Video Generation with Full Assembly

This enhanced version includes complete video assembly using moviepy.

Usage:
    pip install -r requirements.txt --break-system-packages
    python generate_graeber_video_full.py --venice-api-key YOUR_KEY --output amach_vision.mp4 --assemble
"""

import argparse
import json
import os
import time
from pathlib import Path
from typing import Dict, List, Optional
import requests
import base64

try:
    from moviepy.editor import (
        VideoFileClip, ImageClip, AudioFileClip, 
        CompositeVideoClip, concatenate_videoclips
    )
    from moviepy.video.fx.all import resize, fadein, fadeout
    MOVIEPY_AVAILABLE = True
except ImportError:
    print("Warning: moviepy not installed. Video assembly will be limited.")
    MOVIEPY_AVAILABLE = False

# Import the base script from the previous file
import sys
sys.path.insert(0, str(Path(__file__).parent))

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
    
    def generate_image(self, prompt: str, model: str = "fluently-xl") -> bytes:
        """Generate an image using Venice AI"""
        endpoint = f"{VENICE_API_BASE}/image/generate"
        
        payload = {
            "model": model,
            "prompt": prompt,
            "width": 1920,
            "height": 1080,
            "return_binary": False,
            "hide_watermark": True
        }
        
        print(f"Generating image: {prompt[:60]}...")
        
        response = requests.post(endpoint, headers=self.headers, json=payload)
        response.raise_for_status()
        
        data = response.json()
        
        # Extract base64 image data
        if "images" in data and len(data["images"]) > 0:
            base64_data = data["images"][0]
            return base64.b64decode(base64_data)
        else:
            raise Exception("No image data returned from Venice API")
    
    def generate_video(self, prompt: str, model: str = "wan-2.5") -> bytes:
        """Generate a video using Venice AI"""
        endpoint = f"{VENICE_API_BASE}/video/generate"
        
        payload = {
            "model": model,
            "prompt": prompt,
            "width": 1920,
            "height": 1080,
        }
        
        print(f"Generating video: {prompt[:60]}...")
        
        try:
            response = requests.post(endpoint, headers=self.headers, json=payload, timeout=120)
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
            else:
                raise Exception("No video data returned")
                
        except requests.exceptions.HTTPError as e:
            if e.response.status_code == 404:
                print(f"Warning: Video endpoint not found. Falling back to image...")
                return self.generate_image(prompt)
            raise

def setup_directories():
    """Create necessary output directories"""
    for dir_path in [OUTPUT_DIR, ASSETS_DIR, IMAGES_DIR, VIDEOS_DIR, AUDIO_DIR]:
        dir_path.mkdir(parents=True, exist_ok=True)

def generate_assets(api_key: str, script: List[ScriptSection]):
    """Generate all visual assets"""
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
            
            time.sleep(2)  # Rate limiting
            
        except Exception as e:
            print(f"✗ Error: {e}")
            continue
    
    print("\n" + "="*60)
    print("Asset generation complete!")
    print("="*60)

def assemble_video_moviepy(script: List[ScriptSection], output_path: Path, audio_path: Optional[Path] = None):
    """Assemble final video using moviepy"""
    
    if not MOVIEPY_AVAILABLE:
        print("ERROR: moviepy not installed. Install with: pip install moviepy")
        return
    
    print("\nAssembling video with moviepy...")
    
    clips = []
    
    for section in script:
        if not section.asset_path or not section.asset_path.exists():
            print(f"Warning: Missing asset for {section.title}, skipping...")
            continue
        
        try:
            if section.visual_type == "image":
                # Create image clip with Ken Burns effect (slow zoom)
                clip = (ImageClip(str(section.asset_path))
                       .set_duration(section.duration)
                       .resize(height=1080))  # Ensure 1080p
                
                # Add subtle zoom effect
                clip = clip.resize(lambda t: 1 + 0.05 * (t / section.duration))
                
            elif section.visual_type == "video":
                clip = VideoFileClip(str(section.asset_path))
                # Ensure correct duration
                if clip.duration > section.duration:
                    clip = clip.subclip(0, section.duration)
                elif clip.duration < section.duration:
                    # Loop if too short
                    clip = clip.loop(duration=section.duration)
            
            # Add fade in/out for smooth transitions
            if clips:  # Not first clip
                clip = clip.crossfadein(0.5)
            
            clips.append(clip)
            print(f"✓ Added {section.title}")
            
        except Exception as e:
            print(f"✗ Error processing {section.title}: {e}")
            continue
    
    if not clips:
        print("ERROR: No clips to assemble!")
        return
    
    # Concatenate all clips
    print("\nConcatenating clips...")
    final_video = concatenate_videoclips(clips, method="compose")
    
    # Add audio if provided
    if audio_path and audio_path.exists():
        print("Adding audio track...")
        audio = AudioFileClip(str(audio_path))
        final_video = final_video.set_audio(audio)
    
    # Write final video
    print(f"\nRendering final video to: {output_path}")
    print("This may take several minutes...")
    
    final_video.write_videofile(
        str(output_path),
        fps=30,
        codec='libx264',
        audio_codec='aac',
        temp_audiofile='temp-audio.m4a',
        remove_temp=True,
        threads=4
    )
    
    print(f"\n✓ Video successfully created: {output_path}")
    print(f"  Duration: {final_video.duration:.1f}s")
    print(f"  Resolution: {final_video.w}x{final_video.h}")

def main():
    parser = argparse.ArgumentParser(description="Generate Graeberian money history video (FULL VERSION)")
    parser.add_argument("--venice-api-key", required=True, help="Venice AI API key")
    parser.add_argument("--output", default="amach_vision.mp4", help="Output video filename")
    parser.add_argument("--audio", help="Path to voiceover audio file (optional)")
    parser.add_argument("--skip-assets", action="store_true", help="Skip asset generation")
    parser.add_argument("--assemble", action="store_true", help="Assemble video with moviepy")
    
    args = parser.parse_args()
    
    print("="*60)
    print("GRAEBER VIDEO GENERATOR (FULL VERSION)")
    print("="*60)
    
    setup_directories()
    
    # Generate assets
    if not args.skip_assets:
        generate_assets(args.venice_api_key, VIDEO_SCRIPT)
    else:
        print("\nUsing existing assets...")
        # Load existing asset paths
        for i, section in enumerate(VIDEO_SCRIPT):
            if section.visual_type == "image":
                asset_path = IMAGES_DIR / f"{i:02d}_{section.title.lower().replace(' ', '_')}.png"
            else:
                asset_path = VIDEOS_DIR / f"{i:02d}_{section.title.lower().replace(' ', '_')}.mp4"
            
            if asset_path.exists():
                section.asset_path = asset_path
    
    # Assemble video
    if args.assemble:
        output_path = OUTPUT_DIR / args.output
        audio_path = Path(args.audio) if args.audio else None
        assemble_video_moviepy(VIDEO_SCRIPT, output_path, audio_path)
    else:
        print("\nSkipping assembly (use --assemble flag to create final video)")
    
    print("\n" + "="*60)
    print("COMPLETE!")
    print("="*60)

if __name__ == "__main__":
    main()
