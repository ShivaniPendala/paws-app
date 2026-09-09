import logging
from typing import Dict, Any, Optional
import firebase_admin
from firebase_admin import messaging

logger = logging.getLogger("paws.alerts")


def send_ngo_emergency_alert(incident_data: Dict[str, Any]) -> Optional[str]:
    """
    Sends an FCM push notification to all client devices (NGOs) subscribed to the 'ngo_emergency' topic.
    Triggers when injury_score >= 7 or is_emergency is True.
    """
    injury_score = incident_data.get("injury_score", 0)
    is_emergency = incident_data.get("is_emergency", False)

    # Threshold Check
    if not is_emergency and injury_score < 7:
        logger.info("Incident score %s is below emergency threshold. Skipping alert.", injury_score)
        return None

    # Construct FCM Message
    topic = "ngo_emergency"
    summary = incident_data.get("condition_summary", "Critical animal injury reported.")
    incident_id = incident_data.get("incident_id", "unknown")

    message = messaging.Message(
        notification=messaging.Notification(
            title=f"🚨 CRITICAL TRIAGE ALERT (Score: {injury_score}/10)",
            body=summary,
        ),
        data={
            "incident_id": str(incident_id),
            "injury_score": str(injury_score),
            "lat": str(incident_data.get("latitude", "0.0")),
            "lng": str(incident_data.get("longitude", "0.0")),
            "type": "EMERGENCY_RESCUE",
        },
        topic=topic,
    )

    try:
        # Ensure Firebase App is initialized externally before calling this function.
        response = messaging.send(message)
        logger.info("Emergency notification sent successfully. FCM Message ID: %s", response)
        return response
    except Exception as e:
        logger.error("Failed to send FCM alert: %s", str(e))
        return None
