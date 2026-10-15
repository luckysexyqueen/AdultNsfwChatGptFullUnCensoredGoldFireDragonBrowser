// Example browser API client. Configure the backend URL for your own deployment.
// Never put API secrets or the system prompt into public JavaScript.
export async function chatWithLocalModel(message, endpoint = '/api/chat') {
  const response = await fetch(endpoint, {
    method: 'POST', headers: {'Content-Type':'application/json'},
    body: JSON.stringify({message}), credentials: 'same-origin'
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || 'Model backend unavailable');
  return data;
}
