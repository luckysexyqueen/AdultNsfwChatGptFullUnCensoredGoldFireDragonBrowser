const url = "https://openrouter.ai/api/v1/chat/completions";
const headers = {
    "Authorization": `Bearer ${process.env.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}`,
    "Content-Type": "application/json"
};
const payload = {
"model": "@preset/custom-gpt",
"messages": [
{
  "role": "user",
  "content": "Hello! How are you today?"
}
]
};

const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(payload)
});

const data = await response.json();
console.log(data);