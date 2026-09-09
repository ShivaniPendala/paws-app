import os
from dotenv import load_dotenv
from google import genai

load_dotenv()

api_key = os.environ.get("GOOGLE_API_KEY")
print(f"API Key Detected: {bool(api_key)}")

if api_key:
    client = genai.Client(api_key=api_key)
    print("\n--- Available Gemini Models ---")
    try:
        for model in client.models.list():
            # Print available model IDs
            print(f"Model ID: {model.name}")
    except Exception as e:
        print(f"Error listing models: {e}")
