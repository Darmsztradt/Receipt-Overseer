import json
import threading
from typing import Optional
import paho.mqtt.client as mqtt

MQTT_BROKER = "localhost"
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
        try:
            self.client = mqtt.Client(client_id=MQTT_CLIENT_ID, protocol=mqtt.MQTTv311)
            self.client.on_connect = self._on_connect
            self.client.on_disconnect = self._on_disconnect
            
            self.client.connect_async(MQTT_BROKER, MQTT_PORT, keepalive=60)
            self.client.loop_start()
            print(f"[MQTT] Connecting to {MQTT_BROKER}:{MQTT_PORT}...")
        except Exception as e:
            print(f"[MQTT] Failed to initialize: {e}")
    
    def _on_connect(self, client, userdata, flags, rc):
        if rc == 0:
            self.connected = True
            print(f"[MQTT] Connected to broker successfully")
            client.subscribe(MQTT_TOPIC_EXPENSES)
            client.subscribe(MQTT_TOPIC_CHAT)
        else:
            print(f"[MQTT] Connection failed with code {rc}")
    
    def _on_disconnect(self, client, userdata, rc):
        self.connected = False
        print(f"[MQTT] Disconnected from broker (rc={rc})")
    
    def publish(self, message: dict, topic: str = MQTT_TOPIC_EXPENSES):
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
                print(f"[MQTT] Not connected, skipping publish: {message.get('event', 'unknown')}")
    
    def publish_expense_event(self, event_type: str, expense_id: int, **kwargs):
        message = {
            "event": event_type,
            "expense_id": expense_id,
            **kwargs
        }
        self.publish(message, MQTT_TOPIC_EXPENSES)
    
    def publish_chat_message(self, username: str, content: str):
        message = {
            "event": "chat",
            "user": username,
            "msg": content
        }
        self.publish(message, MQTT_TOPIC_CHAT)
    
    def disconnect(self):
        if self.client:
            self.client.loop_stop()
            self.client.disconnect()
            print("[MQTT] Disconnected")

mqtt_handler = MQTTHandler()

mqtt_handler.connect()
