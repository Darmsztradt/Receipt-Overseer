"""
MQTT Protocol Handler for Receipt-Overseer
Publishes expense events to MQTT broker for real-time notifications
"""
import json
import threading
from typing import Optional
import paho.mqtt.client as mqtt

# MQTT Configuration
MQTT_BROKER = "localhost"  # Change to your broker address
MQTT_PORT = 1883
MQTT_TOPIC_EXPENSES = "expenses/events"
MQTT_TOPIC_CHAT = "chat/messages"
MQTT_CLIENT_ID = "receipt-overseer-backend"

class MQTTHandler:
    def __init__(self):
        self.client: Optional[mqtt.Client] = None
        self.connected = False
        self._lock = threading.Lock()
    
    def connect(self):
        """Initialize and connect to MQTT broker"""
        try:
            self.client = mqtt.Client(client_id=MQTT_CLIENT_ID, protocol=mqtt.MQTTv311)
            self.client.on_connect = self._on_connect
            self.client.on_disconnect = self._on_disconnect
            
            # Start connection in background thread
            self.client.connect_async(MQTT_BROKER, MQTT_PORT, keepalive=60)
            self.client.loop_start()
            print(f"[MQTT] Connecting to {MQTT_BROKER}:{MQTT_PORT}...")
        except Exception as e:
            print(f"[MQTT] Failed to initialize: {e}")
    
    def _on_connect(self, client, userdata, flags, rc):
        """Callback when connected to broker"""
        if rc == 0:
            self.connected = True
            print(f"[MQTT] Connected to broker successfully")
            # Subscribe to topics for potential future use
            client.subscribe(MQTT_TOPIC_EXPENSES)
            client.subscribe(MQTT_TOPIC_CHAT)
        else:
            print(f"[MQTT] Connection failed with code {rc}")
    
    def _on_disconnect(self, client, userdata, rc):
        """Callback when disconnected from broker"""
        self.connected = False
        print(f"[MQTT] Disconnected from broker (rc={rc})")
    
    def publish(self, message: dict, topic: str = MQTT_TOPIC_EXPENSES):
        """Publish a message to MQTT topic"""
        with self._lock:
            if self.client and self.connected:
                try:
                    payload = json.dumps(message)
                    result = self.client.publish(topic, payload, qos=1)
                    if result.rc == mqtt.MQTT_ERR_SUCCESS:
                        print(f"[MQTT] Published to {topic}: {message.get('event', 'unknown')}")
                    else:
                        print(f"[MQTT] Publish failed with rc={result.rc}")
                except Exception as e:
                    print(f"[MQTT] Publish error: {e}")
            else:
                # Gracefully handle when broker is not available
                print(f"[MQTT] Not connected, skipping publish: {message.get('event', 'unknown')}")
    
    def publish_expense_event(self, event_type: str, expense_id: int, **kwargs):
        """Convenience method for expense events"""
        message = {
            "event": event_type,
            "expense_id": expense_id,
            **kwargs
        }
        self.publish(message, MQTT_TOPIC_EXPENSES)
    
    def publish_chat_message(self, username: str, content: str):
        """Convenience method for chat messages"""
        message = {
            "event": "chat",
            "user": username,
            "msg": content
        }
        self.publish(message, MQTT_TOPIC_CHAT)
    
    def disconnect(self):
        """Gracefully disconnect from broker"""
        if self.client:
            self.client.loop_stop()
            self.client.disconnect()
            print("[MQTT] Disconnected")

# Global handler instance
mqtt_handler = MQTTHandler()

# Auto-connect on module import
mqtt_handler.connect()
