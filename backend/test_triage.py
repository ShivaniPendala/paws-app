import os
import services.triage_service as triage

# Get the GCP API key from the environment.
# The variable name can be anything you like – e.g. GCP_API_KEY.
GCP_API_KEY = os.getenv("GCP_API_KEY")
if not GCP_API_KEY:
    raise RuntimeError("GCP_API_KEY environment variable not set")

# If the triage service expects the key as a parameter, pass it:
# result = triage.analyze_image(img_bytes, api_key=GCP_API_KEY)
