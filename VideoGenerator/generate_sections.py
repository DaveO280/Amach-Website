#!/usr/bin/env python3
"""
Generate only specific sections of the Graeber video

Usage:
    # Generate just sections 0, 1, and 2:
    python generate_sections.py --venice-api-key YOUR_KEY --sections 0 1 2
    
    # Generate sections 0-5:
    python generate_sections.py --venice-api-key YOUR_KEY --sections 0-5
    
    # List available sections:
    python generate_sections.py --list
"""

import argparse
import base64
import requests
import time
from pathlib import Path
import sys

# Add parent directory to path to import from main script
sys.path.insert(0, str(Path(__file__).parent))

VENICE_API_BASE = "https://api.venice.ai/api/v1"
OUTPUT_DIR = Path("./graeber_assets")
IMAGES_DIR = OUTPUT_DIR / "images"
VIDEOS_DIR = OUTPUT_DIR / "videos"

class ScriptSection:
    """Video section definition"""
    def __init__(self, idx: int, title: str, start_time: float, duration: float, 
                 narration: str, visual_type: str, prompt: str):
        self.idx = idx
        self.title = title
        self.start_time = start_time
        self.duration = duration
        self.narration = narration
        self.visual_type = visual_type
        self.prompt = prompt

# All sections
ALL_SECTIONS = [
    ScriptSection(0, "Opening", 0, 10, "For thousands of years...", "image",
        "Ancient coins and scrolls on weathered parchment, dramatic lighting, cinematic, historical atmosphere, 16:9"),
    ScriptSection(1, "The Myth", 10, 8, "The myth goes like this...", "image",
        "Medieval marketplace illustration showing primitive barter, hand-drawn style, historical documentation feel, muted colors, 16:9"),
    ScriptSection(2, "Chicken Scene", 18, 5, "Except... that never happened.", "video",
        "Medieval peasant trying to trade live chickens with a blacksmith for an iron axe, frustrated, chickens escaping, comedic timing, cinematic lighting, 5 second duration, 16:9"),
    ScriptSection(3, "Graeber's Research", 23, 12, "Anthropologist David Graeber...", "image",
        "Anthropological research imagery, ancient debt tablets, community networks visualization, scholarly aesthetic, muted academic colors, 16:9"),
    ScriptSection(4, "Money's Purpose", 35, 10, "Money wasn't invented...", "image",
        "Ancient army formations and tax collectors, historical documentation style, imposing architecture, power dynamics visualization, cinematic, 16:9"),
    ScriptSection(5, "Modern Abstraction", 45, 12, "Today, money is backed by...", "image",
        "Modern financial trading screens with stock market data, abstract numbers floating in digital space, disconnected from reality, cold blue lighting, 16:9"),
    ScriptSection(6, "Financial Glitch", 57, 3, "", "video",
        "Stock market charts and financial data dissolving into static and glitching, matrix-style corruption, numbers becoming meaningless, unsettling transformation, 3 second duration, 16:9"),
    ScriptSection(7, "Participation", 60, 8, "And somehow, we all just...", "image",
        "People staring at smartphone screens showing stock tickers and financial apps, disconnected expressions, modern urban setting, cold tones, 16:9"),
    ScriptSection(8, "Health Data Locked", 68, 12, "Meanwhile, something genuinely valuable...", "image",
        "Medical records behind locked corporate logos, scattered health data visualization, person reaching for their own information but blocked, dystopian healthcare system, 16:9"),
    ScriptSection(9, "Possibility", 80, 10, "But what if we could build...", "image",
        "Clean geometric blockchain network visualization, crystalline structure, transparent and verifiable nodes, hopeful blue and white tones, technical but accessible, 16:9"),
    ScriptSection(10, "Order from Chaos", 90, 4, "Not money 2.0...", "video",
        "Geometric blockchain network forming from chaos, clean lines crystallizing, order emerging from disorder, hopeful but grounded, 4 second duration, 16:9"),
    ScriptSection(11, "Real Utility", 94, 8, "What if instead of...", "image",
        "Human-centered technology interface, health data flowing to real people, warm tones contrasting with previous cold imagery, hope and agency, 16:9"),
    ScriptSection(12, "Amach Introduction", 102, 12, "This is where Amach comes in...", "image",
        "Clean health data dashboard showing Amach platform, user-controlled interface, transparent data flows, modern medical visualization, professional and trustworthy, 16:9"),
    ScriptSection(13, "Better Services", 114, 12, "Better actuarial models...", "image",
        "Cohort analysis visualization, AI-assisted health insights, people benefiting from real data, network effects visualization, optimistic and grounded, 16:9"),
    ScriptSection(14, "Full Circle", 126, 12, "Graeber showed us...", "image",
        "Person holding their complete health data securely, connected to community health network, full circle from opening imagery, warm human-centered tones, 16:9"),
    ScriptSection(15, "Closing", 138, 7, "Not the future of money...", "image",
        "Amach Health logo on clean background with tagline 'Value Moored to Reality', professional, confident, simple and powerful, 16:9"),
]

class VeniceClient:
    def __init__(self, api_key: str):
        self.api_key = api_key
        self.headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json"
        }
    
    def generate_image(self, prompt: str) -> bytes:
        """Generate image with model fallback - prioritizing quality"""
        # Order: nano-banana-pro > hidream > venice-sd35 > qwen-image
        models = ["nano-banana-pro", "hidream", "venice-sd35", "qwen-image"]
        
        for model in models:
            try:
                payload = {
                    "model": model,
                    "prompt": prompt,
                    "width": 1280,
                    "height": 720,
                    "return_binary": False
                }
                
                response = requests.post(
                    f"{VENICE_API_BASE}/image/generate",
                    headers=self.headers,
                    json=payload,
                    timeout=60
                )
                
                if response.status_code == 429:
                    print(f"  Rate limited with {model}, waiting 15s...")
                    time.sleep(15)
                    continue
                
                response.raise_for_status()
                data = response.json()
                
                if "images" in data and len(data["images"]) > 0:
                    print(f"  ✓ Generated with {model}")
                    return base64.b64decode(data["images"][0])
            except Exception as e:
                print(f"  Model {model} failed: {str(e)[:50]}")
                continue
        
        raise Exception("All image models failed")
    
    def generate_video(self, prompt: str, duration: int) -> bytes:
        """Generate video with model fallback - prioritizing quality"""
        # Sora 2 Pro > Veo 3.1 Full > Kling 2.6 Pro > Wan 2.6
        models = [
            "sora-2-pro-text-to-video",
            "veo3.1-full-text-to-video", 
            "kling-2.6-pro-text-to-video",
            "wan-2.6-text-to-video"
        ]
        
        for model in models:
            try:
                payload = {
                    "model": model,
                    "prompt": prompt,
                    "duration": duration
                }
                
                response = requests.post(
                    f"{VENICE_API_BASE}/video/generate",
                    headers=self.headers,
                    json=payload,
                    timeout=180
                )
                
                if response.status_code == 429:
                    print(f"  Rate limited with {model}, waiting 15s...")
                    time.sleep(15)
                    continue
                
                response.raise_for_status()
                data = response.json()
                
                # Handle different response formats
                for key in ["video", "url", "videos"]:
                    if key in data:
                        video_data = data[key]
                        if isinstance(video_data, list):
                            video_data = video_data[0]
                        if isinstance(video_data, str):
                            if video_data.startswith("http"):
                                print(f"  ✓ Generated with {model}, downloading...")
                                return requests.get(video_data).content
                            else:
                                print(f"  ✓ Generated with {model}")
                                return base64.b64decode(video_data)
            except Exception as e:
                print(f"  Model {model} failed: {str(e)[:50]}")
                continue
        
        # Fallback to image
        print(f"  Video failed, falling back to image")
        return self.generate_image(prompt)

def list_sections():
    """List all available sections"""
    print("\n" + "="*60)
    print("AVAILABLE SECTIONS")
    print("="*60)
    for section in ALL_SECTIONS:
        print(f"{section.idx:2d}. [{section.visual_type:5s}] {section.title}")
        print(f"    Time: {section.start_time}s - {section.start_time + section.duration}s")
        print(f"    Prompt: {section.prompt[:60]}...")
        print()

def generate_sections(api_key: str, section_indices: list):
    """Generate specific sections"""
    # Setup directories
    OUTPUT_DIR.mkdir(exist_ok=True)
    IMAGES_DIR.mkdir(exist_ok=True)
    VIDEOS_DIR.mkdir(exist_ok=True)
    
    client = VeniceClient(api_key)
    
    print("\n" + "="*60)
    print(f"GENERATING {len(section_indices)} SECTIONS")
    print("="*60)
    
    for i, idx in enumerate(section_indices):
        if idx >= len(ALL_SECTIONS):
            print(f"\nSkipping invalid section index: {idx}")
            continue
        
        section = ALL_SECTIONS[idx]
        
        print(f"\n[{i+1}/{len(section_indices)}] Section {idx}: {section.title}")
        print(f"Type: {section.visual_type}")
        print(f"Prompt: {section.prompt[:60]}...")
        
        try:
            if section.visual_type == "image":
                data = client.generate_image(section.prompt)
                filename = f"{idx:02d}_{section.title.lower().replace(' ', '_')}.png"
                filepath = IMAGES_DIR / filename
                filepath.write_bytes(data)
                print(f"✓ Saved: {filepath}")
                
            elif section.visual_type == "video":
                data = client.generate_video(section.prompt, int(section.duration))
                filename = f"{idx:02d}_{section.title.lower().replace(' ', '_')}.mp4"
                filepath = VIDEOS_DIR / filename
                filepath.write_bytes(data)
                print(f"✓ Saved: {filepath}")
            
            # Rate limiting between sections
            if i < len(section_indices) - 1:
                print("Waiting 5 seconds...")
                time.sleep(5)
                
        except Exception as e:
            print(f"✗ Error: {e}")
            continue
    
    print("\n" + "="*60)
    print("COMPLETE!")
    print("="*60)
    print(f"\nAssets saved to: {OUTPUT_DIR.absolute()}")
    print(f"  Images: {len(list(IMAGES_DIR.glob('*.png')))}")
    print(f"  Videos: {len(list(VIDEOS_DIR.glob('*.mp4')))}")

def parse_section_args(sections_arg: list) -> list:
    """Parse section arguments (e.g., ['0', '1', '2'] or ['0-5'])"""
    indices = []
    for arg in sections_arg:
        if '-' in arg:
            start, end = map(int, arg.split('-'))
            indices.extend(range(start, end + 1))
        else:
            indices.append(int(arg))
    return sorted(set(indices))

def main():
    parser = argparse.ArgumentParser(description="Generate specific sections")
    parser.add_argument("--venice-api-key", help="Venice AI API key")
    parser.add_argument("--sections", nargs='+', help="Section indices to generate (e.g., 0 1 2 or 0-5)")
    parser.add_argument("--list", action="store_true", help="List all available sections")
    
    args = parser.parse_args()
    
    if args.list:
        list_sections()
        return
    
    if not args.venice_api_key:
        print("Error: --venice-api-key required (unless using --list)")
        return
    
    if not args.sections:
        print("Error: --sections required")
        print("Example: python generate_sections.py --venice-api-key KEY --sections 0 1 2")
        print("Or use --list to see available sections")
        return
    
    section_indices = parse_section_args(args.sections)
    generate_sections(args.venice_api_key, section_indices)

if __name__ == "__main__":
    main()