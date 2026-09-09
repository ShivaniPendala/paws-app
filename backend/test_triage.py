import os

# 1. Set the API key BEFORE importing the triage service
os.environ["GOOGLE_API_KEY"] = "AQ.Ab8RN6L-18dIq4j5Un_I8EKXfBjKfT3h97yoVR39m_tMqObQpQ"

import services.triage_service as triage

image_path = r"C:\Users\PENDALA SHIVANI\OneDrive\Pictures\Screenshots\Screenshot 2026-09-05 222506.png"

try:
    with open(image_path, "rb") as f:
        img_bytes = f.read()

    print("Sending image to Gemini 1.5 Flash...")
    result = triage.analyze_image(img_bytes)

    print("\n--- Live AI Triage Result ---")
    print(result)
except Exception as e:
    print(f"Execution Error: {e}")