import os
import services.triage_service as triage

# Set your Gemini API Key explicitly for testing
os.environ["GOOGLE_API_KEY"] = "--YOUR-GEMINI-API-KEY-HERE--"
    
# Windows raw string path
image_path = r"C:\Users\PENDALA SHIVANI\OneDrive\Pictures\Spike.jpeg"

try:
    with open(image_path, "rb") as f:
        img_bytes = f.read()

    print("Sending image to Gemini 1.5 Flash...")
    result = triage.analyze_image(img_bytes)
    
    print("\n--- Live AI Triage Result ---")
    print(result)
except Exception as e:
    print(f"Execution Error: {e}")