curl https://openrouter.ai/api/v1/chat/completions \
-H "Authorization: Bearer $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" \
-H "Content-Type: application/json" \
-d '{
  "model": "@preset/custom-gpt",
  "messages": [
      {
          "role": "user",
          "content": "Hello! How are you today?"
      }
  ]
}'
