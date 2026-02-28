import urllib.request
import json

data = json.dumps({
    'image': 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADklEQVQI12P4z8BQDwAEgAF/QualIQAAAAABJRU5ErkJggg==',
    'prompt': 'What color is this pixel?'
}).encode()

req = urllib.request.Request(
    'https://asaha96--orca-vision-visionmodel-web-analyze.modal.run/',
    data=data,
    headers={'Content-Type': 'application/json'}
)

try:
    response = urllib.request.urlopen(req, timeout=60)
    print(response.read().decode())
except Exception as e:
    print(f"Error: {e}")
