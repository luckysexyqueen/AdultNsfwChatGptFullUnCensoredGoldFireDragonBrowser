import unittest
from tools.mcp_url import endpoint, registration

class MCPUrlTests(unittest.TestCase):
    def test_origin(self):
        self.assertEqual(endpoint('https://my-service.example.net'), 'https://my-service.example.net/mcp')
    def test_existing_path(self):
        self.assertEqual(endpoint('https://my-service.example.net/api/mcp'), 'https://my-service.example.net/api/mcp')
    def test_invalid(self):
        for value in ['http://my-service.example.net', 'https://example.com', 'https://u:p@my-service.example.net', 'https://my-service.example.net/?token=123', 'https://localhost']:
            with self.subTest(value=value):
                with self.assertRaises(ValueError): endpoint(value)
    def test_registration(self):
        self.assertEqual(registration('https://x.example.net/mcp')['transport'], 'streamable-http')
if __name__ == '__main__': unittest.main()
