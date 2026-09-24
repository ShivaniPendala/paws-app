import os
from dotenv import load_dotenv
from google import genai

# Load environment variables
load_dotenv()

api_key = os.environ.get("GEMINI_API_KEY") 
print(f"1. API Key found: {bool(api_key)}")

if api_key:
    try:
        print("2. Connecting to Gemini...")
        client = genai.Client(api_key=api_key)
        response = client.models.generate_content(
            model='gemini-flash-latest',
            contents='Return a valid JSON object with the key "test" and value "success".',
            config=genai.types.GenerateContentConfig(response_mime_type="application/json")
        )
        print(f"3. Success! Response: {response.text}")
    except Exception as e:
        print(f"3. FAIL: The API call crashed. Error details: {e}")