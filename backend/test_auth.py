import unittest
from fastapi.testclient import TestClient

from main import app


class AuthGuardTests(unittest.TestCase):
    def test_report_endpoint_requires_auth(self):
        client = TestClient(app)
        response = client.post(
            "/api/report/process",
            files={"image": ("test.jpg", b"fake-image-content", "image/jpeg")},
            data={
                "lat": 17.385,
                "lng": 78.4867,
                "is_bleeding": False,
                "unable_to_move": False,
                "in_traffic": False,
                "ignore_match": False,
            },
        )

        self.assertEqual(response.status_code, 401)
        self.assertIn("Unauthorized", response.text)


if __name__ == "__main__":
    unittest.main()
