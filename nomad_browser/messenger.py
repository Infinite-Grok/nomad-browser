"""LXMF messenger — send/receive messages, store conversations locally."""
import os, json, time, threading
from datetime import datetime
import RNS, LXMF
from . import identity


def _clean_addr(addr):
    """Strip angle brackets and whitespace from LXMF addresses."""
    return addr.replace("<", "").replace(">", "").replace(" ", "")


class Messenger:
    def __init__(self, data_dir):
        self.data_dir = data_dir
        self.conversations_dir = os.path.join(data_dir, "conversations")
        os.makedirs(self.conversations_dir, exist_ok=True)

        self.identity = identity.get_identity()
        self.router = LXMF.LXMRouter(
            identity=self.identity,
            storagepath=os.path.join(data_dir, "lxmf_storage")
        )
        self.delivery = self.router.register_delivery_identity(
            self.identity, display_name="Nomad Browser"
        )
        self.router.register_delivery_callback(self._on_message)
        self._incoming = []
        self._lock = threading.Lock()
        self.router.announce(self.delivery.hash)
        self.lxmf_address = RNS.prettyhexrep(self.delivery.hash).replace("<","").replace(">","")

    def send(self, to_address, content):
        """Send LXMF message. Returns message_id string."""
        dest_hash = bytes.fromhex(to_address.replace("<", "").replace(">", "").replace(" ", ""))
        if not RNS.Transport.has_path(dest_hash):
            RNS.Transport.request_path(dest_hash)
            start = time.time()
            while not RNS.Transport.has_path(dest_hash):
                if time.time() - start > 30:
                    raise TimeoutError("No path to destination")
                time.sleep(0.1)
        dest_identity = RNS.Identity.recall(dest_hash)
        if not dest_identity:
            raise ValueError("Cannot recall identity for destination")
        dest = RNS.Destination(
            dest_identity,
            RNS.Destination.OUT,
            RNS.Destination.SINGLE,
            "lxmf", "delivery"
        )
        msg = LXMF.LXMessage(
            dest,
            self.delivery,
            content.encode('utf-8'),
            desired_method=LXMF.LXMessage.DIRECT
        )
        msg.delivery_callback = lambda m: RNS.log(f"Delivered to {to_address}")
        msg.failed_callback = lambda m: RNS.log(f"Failed to {to_address}")
        self.router.handle_outbound(msg)
        self._store_message(to_address, {
            "from": self.lxmf_address,
            "to": _clean_addr(to_address),
            "content": content,
            "timestamp": datetime.utcnow().isoformat(),
            "status": "sent"
        })
        return RNS.prettyhexrep(msg.hash) if hasattr(msg, 'hash') and msg.hash else "sent"

    def _on_message(self, message):
        """Callback for incoming LXMF messages."""
        try:
            sender = RNS.prettyhexrep(message.source_hash).replace("<","").replace(">","").replace(" ","")
            content = message.content.decode('utf-8') if isinstance(message.content, bytes) else str(message.content)
            msg_data = {
                "from": sender,
                "to": self.lxmf_address,
                "content": content,
                "timestamp": datetime.utcnow().isoformat(),
                "status": "received"
            }
            self._store_message(sender, msg_data)
            with self._lock:
                self._incoming.append({"address": sender, **msg_data})
        except Exception as e:
            RNS.log(f"Error handling message: {e}")

    def get_messages(self, address, since=None):
        """Return stored messages for a conversation."""
        addr_clean = address.replace("<", "").replace(">", "").replace(" ", "")
        msg_file = os.path.join(self.conversations_dir, addr_clean, "messages.json")
        if not os.path.exists(msg_file):
            return []
        with open(msg_file, 'r', encoding='utf-8') as f:
            messages = json.load(f)
        if since:
            messages = [m for m in messages if m["timestamp"] > since]
        return messages

    def get_new_messages(self):
        """Drain and return the incoming message queue."""
        with self._lock:
            msgs = list(self._incoming)
            self._incoming.clear()
        return msgs

    def list_conversations(self):
        """Return list of conversation metadata dicts."""
        convs = []
        if not os.path.exists(self.conversations_dir):
            return convs
        for d in sorted(os.listdir(self.conversations_dir)):
            meta_file = os.path.join(self.conversations_dir, d, "meta.json")
            if os.path.exists(meta_file):
                with open(meta_file, 'r', encoding='utf-8') as f:
                    convs.append(json.load(f))
        return convs

    def set_conversation_name(self, address, name):
        """Set a display name for a conversation."""
        addr_clean = address.replace("<", "").replace(">", "").replace(" ", "")
        conv_dir = os.path.join(self.conversations_dir, addr_clean)
        os.makedirs(conv_dir, exist_ok=True)
        meta_file = os.path.join(conv_dir, "meta.json")
        meta = {"address": address, "name": name}
        if os.path.exists(meta_file):
            with open(meta_file, 'r', encoding='utf-8') as f:
                meta = json.load(f)
            meta["name"] = name
        with open(meta_file, 'w', encoding='utf-8') as f:
            json.dump(meta, f)

    def _store_message(self, address, msg_data):
        """Persist a message to the conversation directory."""
        addr_clean = address.replace("<", "").replace(">", "").replace(" ", "")
        conv_dir = os.path.join(self.conversations_dir, addr_clean)
        os.makedirs(conv_dir, exist_ok=True)
        meta_file = os.path.join(conv_dir, "meta.json")
        if not os.path.exists(meta_file):
            with open(meta_file, 'w', encoding='utf-8') as f:
                json.dump({
                    "address": address,
                    "name": address[:16] + "...",
                    "last_seen": msg_data["timestamp"]
                }, f)
        else:
            with open(meta_file, 'r', encoding='utf-8') as f:
                meta = json.load(f)
            meta["last_seen"] = msg_data["timestamp"]
            with open(meta_file, 'w', encoding='utf-8') as f:
                json.dump(meta, f)
        msg_file = os.path.join(conv_dir, "messages.json")
        messages = []
        if os.path.exists(msg_file):
            with open(msg_file, 'r', encoding='utf-8') as f:
                messages = json.load(f)
        messages.append(msg_data)
        with open(msg_file, 'w', encoding='utf-8') as f:
            json.dump(messages, f, indent=2)
