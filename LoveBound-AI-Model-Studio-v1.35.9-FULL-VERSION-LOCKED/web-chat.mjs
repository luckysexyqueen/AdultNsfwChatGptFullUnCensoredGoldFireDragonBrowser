import '../ai/boot.mjs';
const $ = id => document.getElementById(id);
let busy = false;
async function prepare(file) {
  if (busy) return;
  busy = true; $('load').disabled = true; $('file').disabled = true; $('send').disabled = true;
  const options = { onProgress: text => { $('status').textContent = text; } };
  try {
    if (file) await window.LocalGGUF.load([file], options);
    else await window.GFDAI.loadKoreanModel(options);
    $('status').textContent = 'GGUF 준비 완료 · 기기 내 추론';
  } catch (error) { $('status').textContent = error.message; }
  finally { busy = false; $('load').disabled = false; $('file').disabled = false; $('send').disabled = !window.LocalGGUF.getStatus().ready; }
}
$('load').onclick = () => prepare();
$('file').onchange = event => event.target.files[0] && prepare(event.target.files[0]);
$('send').onclick = async () => {
  const content = $('prompt').value.trim();
  if (busy || !content) return;
  busy = true; $('send').disabled = true; $('load').disabled = true; $('file').disabled = true; $('reply').textContent = '';
  try {
    $('status').textContent = '한국어 응답 생성 중…';
    const reply = await window.LocalGGUF.generate([{ role: 'user', content }], { maxTokens: 128 });
    $('reply').textContent = reply; $('status').textContent = '응답 완료 · 서버 전송 없음';
  } catch (error) { $('status').textContent = error.message; }
  finally { busy = false; $('send').disabled = false; $('load').disabled = false; $('file').disabled = false; }
};
