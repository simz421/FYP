#!/usr/bin/env python3
"""
Test all NMS API endpoints
"""
import requests
import json
import time
from datetime import datetime, timedelta

BASE_URL = "http://localhost:5000/api"

def test_endpoint(method, endpoint, data=None, expected_status=200):
    """Test a single endpoint"""
    url = f"{BASE_URL}{endpoint}"
    
    try:
        if method == "GET":
            response = requests.get(url, params=data)
        elif method == "POST":
            response = requests.post(url, json=data)
        elif method == "PUT":
            response = requests.put(url, json=data)
        elif method == "DELETE":
            response = requests.delete(url)
        else:
            return False, f"Unknown method: {method}"
        
        success = response.status_code == expected_status
        message = f"{method} {endpoint}: {response.status_code}"
        
        if success:
            return True, f"✅ {message}"
        else:
            try:
                error_data = response.json()
                return False, f"❌ {message} - {error_data.get('error', 'Unknown error')}"
            except:
                return False, f"❌ {message}"
                
    except requests.exceptions.ConnectionError:
        return False, f"❌ {method} {endpoint}: Connection failed (is server running?)"
    except Exception as e:
        return False, f"❌ {method} {endpoint}: {str(e)}"

def run_all_tests():
    """Run comprehensive API tests"""
    print("🚀 Starting Smart Farm NMS API Tests")
    print("=" * 50)
    
    tests = [
        # Health endpoints
        ("GET", "/health", None, 200),
        
        # Device endpoints
        ("POST", "/devices/register", {
            "device_id": "TEST_DEVICE_01",
            "name": "Test Sensor",
            "node_type": "sensor"
        }, 201),
        
        ("GET", "/devices", None, 200),
        
        # Sensor endpoints
        ("POST", "/sensors/telemetry/ingest", {
            "device_id": "TEST_DEVICE_01",
            "sensor_type": "temperature",
            "value": 25.5,
            "unit": "°C"
        }, 201),
        
        ("GET", "/sensors/readings?limit=5", None, 200),
        
        # Alert endpoints
        ("GET", "/alerts", None, 200),
        
        # Network endpoints
        ("GET", "/network/health", None, 200),
        ("GET", "/network/diagnostics/sweep", None, 200),
        
        # Report endpoints
        ("GET", "/reports/daily?day=2025-02-08", None, 200),
        
        # System endpoints
        ("GET", "/system/health", None, 200),
        
        # Export endpoints
        ("GET", "/export/available-formats", None, 200),
        
        # Audit endpoints
        ("GET", "/audit/summary", None, 200),
        
        # API Documentation
        ("GET", "/docs/summary", None, 200),
    ]
    
    results = []
    passed = 0
    failed = 0
    
    for test in tests:
        method, endpoint, data, expected = test
        success, message = test_endpoint(method, endpoint, data, expected)
        results.append((success, message))
        
        if success:
            passed += 1
        else:
            failed += 1
        
        print(message)
        time.sleep(0.1)  # Small delay between requests
    
    print("\n" + "=" * 50)
    print(f"📊 Test Results: {passed} passed, {failed} failed")
    
    if failed == 0:
        print("🎉 All tests passed! System is ready.")
    else:
        print("⚠️  Some tests failed. Check the errors above.")
    
    # Display API summary
    try:
        response = requests.get(f"{BASE_URL}/docs/summary")
        if response.status_code == 200:
            data = response.json()
            print(f"\n📡 API Summary:")
            print(f"   Version: {data.get('api_version', 'N/A')}")
            print(f"   Endpoints: {data.get('total_endpoints', 0)}")
            print(f"   Documentation: {BASE_URL}/docs/ui")
    except:
        pass

if __name__ == "__main__":
    run_all_tests()