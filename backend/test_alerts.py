import os
import firebase_admin
from firebase_admin import credentials
from dotenv import load_dotenv
from services.alert_service import send_ngo_emergency_alert

load_dotenv()

# Your verified GCP/Firebase Project ID
PROJECT_ID = os.environ.get("GCP_PROJECT", "project-p-507510")

# Initialize Firebase Admin app with Project ID
if not firebase_admin._apps:
    cred_path = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS")
    if cred_path and os.path.exists(cred_path):
        cred = credentials.Certificate(cred_path)
        firebase_admin.initialize_app(cred, {"projectId": PROJECT_ID})
    else:
        firebase_admin.initialize_app(options={"projectId": PROJECT_ID})

print("--- Testing NGO Emergency Alert Dispatch ---")

sample_incident = {
    "incident_id": "INC-TEST-9981",
    "injury_score": 9,
    "is_emergency": True,
    "condition_summary": "Severe open wound on hind limb requiring immediate medical rescue.",
    "latitude": 17.3850,
    "longitude": 78.4867
}

result = send_ngo_emergency_alert(sample_incident)
if result:
    print(f"Success! Alert dispatched to topic 'ngo_emergency'. Message ID: {result}")
else:
    print("Failed or skipped notification dispatch.")