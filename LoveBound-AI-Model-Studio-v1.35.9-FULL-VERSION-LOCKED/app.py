"""LoveBound AI Model Studio v1.35.9 — Hugging Face Spaces diagnostics UI.

No untrusted uploads are extracted or executed. No inference or deployment is implied.
"""
import hashlib
import json
import pathlib
import zipfile
import gradio as gr
from scripts.hf_upload_audit import inspect as hf_inspect
from scripts.dual_webview_plan import inspect as dual_inspect

ROOT = pathlib.Path(__file__).resolve().parent
MAX_UPLOAD_BYTES = 250 * 1024 * 1024
MAX_ENTRIES = 25000

def inventory():
    manifest=json.loads((ROOT/'plugin.json').read_text(encoding='utf-8'))
    archives=sorted((ROOT/'assets').glob('*.zip'))
    scripts=sorted((ROOT/'scripts').glob('*.py'))
    return {'name':manifest['name'],'version':manifest['version'],
            'original_source_archives':len(archives),'python_scripts':len(scripts),
            'capabilities':['read-only ZIP audit','dual WebView inventory','source preservation'],
            'not_implemented':['model inference','training from Gradio UI','Android/Windows build','ChatGPT plugin runtime','automatic repair of model weights']}

def inspect_upload(upload, category):
    if not upload:
        return json.dumps({'error':'ZIP 파일을 먼저 업로드하세요.'},ensure_ascii=False)
    p=pathlib.Path(upload)
    if p.suffix.lower()!='.zip' or not p.is_file():
        return json.dumps({'error':'ZIP 파일만 지원합니다.'},ensure_ascii=False)
    if p.stat().st_size>MAX_UPLOAD_BYTES:
        return json.dumps({'error':'250MiB를 초과하는 ZIP은 검사하지 않습니다.'},ensure_ascii=False)
    try:
        with zipfile.ZipFile(p) as z:
            entries=z.infolist()
            if len(entries)>MAX_ENTRIES:
                raise ValueError('ZIP 엔트리가 25,000개를 초과합니다.')
            if sum(i.file_size for i in entries)>2*1024**3:
                raise ValueError('압축 해제 예상 크기가 2GiB를 초과합니다.')
        report=hf_inspect(p) if category=='Hugging Face 모델 / Space' else dual_inspect(p)
        report['security_note']='Uploaded ZIP was inspected without extraction or code execution.'
        return json.dumps(report,ensure_ascii=False,indent=2)
    except (zipfile.BadZipFile,OSError,ValueError,RuntimeError) as exc:
        return json.dumps({'error':str(exc)},ensure_ascii=False)

def version_check():
    expected='1.35.9'
    actual={p:json.loads((ROOT/p).read_text(encoding='utf-8')).get('version') for p in ['plugin.json','.codex-plugin/plugin.json']}
    return json.dumps({'expected':expected,'manifests':actual,'pass':all(v==expected for v in actual.values())},ensure_ascii=False,indent=2)

with gr.Blocks(title='LoveBound AI Model Studio 1.35.9') as demo:
    gr.Markdown('# 💜 LoveBound AI Model Studio v1.35.9\n**Hugging Face Spaces FULL** — 원본 플러그인 파일 구조와 소스 ZIP 24개 보존')
    gr.Markdown('이 Space는 업로드된 프로젝트를 **읽기 전용**으로 검사합니다. GGUF 추론·모델 학습·빌드·자동 수리 기능은 별도의 실행 환경이 필요합니다.')
    with gr.Tab('ZIP 프로젝트 진단'):
        source=gr.File(label='검사할 프로젝트 ZIP',file_types=['.zip'],type='filepath')
        category=gr.Radio(['Hugging Face 모델 / Space','GeckoView + Chromium WebView'],value='Hugging Face 모델 / Space',label='검사 종류')
        go=gr.Button('검사 실행',variant='primary')
        result=gr.Code(label='진단 결과 JSON',language='json')
        go.click(fn=inspect_upload,inputs=[source,category],outputs=result)
    with gr.Tab('MergeKit · Fine-tuning · LoRA'):
        gr.Markdown('### 학습 실행 계획 생성 (안전 모드)\n실제 학습은 GPU가 준비된 별도 실행 환경에서 사용자 승인을 거쳐 CLI로 실행합니다. 이 화면은 **학습을 시작하지 않습니다.**')
        train_kind=gr.Dropdown(['mergekit','lora','qlora','full'],value='lora',label='작업 유형')
        train_model=gr.Textbox(label='HF 모델 ID (MergeKit에서는 YAML 사용)',placeholder='organization/model-name')
        train_dataset=gr.Textbox(label='JSONL 데이터셋 파일 경로',value='training/datasets/example.jsonl')
        train_config=gr.Textbox(label='MergeKit YAML 경로',value='training/mergekit/example-config.yaml')
        train_output=gr.Textbox(label='새 출력 폴더',value='outputs/new-run')
        train_plan=gr.Code(label='실행 계획 JSON',language='json')
        def make_train_plan(kind,model,dataset,config,output):
            return json.dumps({'version':'1.35.9','mode':'PLAN ONLY','kind':kind,'model':model,'dataset':dataset if kind!='mergekit' else None,'merge_config':config if kind=='mergekit' else None,'output':output,'requirements':'training/requirements-training.txt','execution':'Run training/run_training.py --help in your own approved GPU environment','warning':'No training executed; review model compatibility, hardware, license and costs'},ensure_ascii=False,indent=2)
        gr.Button('학습 계획 생성',variant='primary').click(make_train_plan,[train_kind,train_model,train_dataset,train_config,train_output],train_plan)
    with gr.Tab('내 시스템 프롬프트 · 자동 오류 진단'):
        gr.Markdown('사용자 지정 프롬프트를 입력하고 SHA256을 확인합니다. 이 화면은 모델 가중치를 변경하거나 학습을 실행하지 않습니다.')
        prompt_input=gr.Textbox(label='내 기본 시스템 프롬프트',lines=8,placeholder='여기에 직접 시스템 프롬프트를 입력하세요')
        prompt_hash=gr.Code(label='프롬프트 검증 정보',language='json')
        def prompt_preview(value):
            value=value.strip()
            if not value:return json.dumps({'error':'프롬프트를 입력하세요'},ensure_ascii=False)
            if len(value.encode('utf-8'))>65536:return json.dumps({'error':'64KiB 제한 초과'},ensure_ascii=False)
            return json.dumps({'version':'1.35.9','sha256':hashlib.sha256(value.encode('utf-8')).hexdigest(),'chars':len(value),'status':'preview_only','next':'Save in private training/system_prompt.txt and explicitly approve hash before preparing training data'},ensure_ascii=False,indent=2)
        gr.Button('프롬프트 검증').click(prompt_preview,prompt_input,prompt_hash)
        gr.Markdown('### 학습 오류 로그 분석 (읽기 전용)')
        error_log=gr.Textbox(label='오류 로그 붙여넣기',lines=7)
        error_result=gr.Code(label='오류 분석',language='json')
        def diagnose_error(value):
            from training.model_error_doctor import scan
            return json.dumps({'version':'1.35.9','findings':scan(value[:100000]),'automatic_changes':'none','note':'For safe fixed copies, run training/auto_repair.py on an approved environment'},ensure_ascii=False,indent=2)
        gr.Button('오류 자동 분석').click(diagnose_error,error_log,error_result)
    with gr.Tab('한국어 기본 · 번역 학습 데이터'):
        gr.Markdown("### 한국어(ko-KR) 기본 / 미국 영어(en-US) 보조\\n그 외 언어는 **외국어 → en-US → ko-KR** 경로만 허용합니다. 이 화면은 승인된 번역 쌍을 검증하고 학습용 JSONL을 미리 보여줍니다. 자동 번역이나 학습을 실행하지 않습니다.")
        translation_pairs=gr.Textbox(label="승인된 번역 쌍 JSONL",lines=6,value='{"source_lang":"en-US","source":"Hello!","korean":"안녕하세요!"}')
        translation_prompt=gr.Textbox(label="내 기본 시스템 프롬프트",lines=5)
        translation_hash=gr.Textbox(label="승인한 시스템 프롬프트 SHA256")
        translation_preview=gr.Code(label="학습 데이터 미리보기 / 오류",language="json")
        def preview_korean_sft(pairs,prompt,approved):
            import tempfile
            from training.prepare_korean_sft import prepare
            try:
                with tempfile.TemporaryDirectory() as td:
                    target=pathlib.Path(td)/"preview.jsonl"
                    result=prepare(pairs,prompt,approved,target)
                    result["samples"]=[json.loads(x) for x in target.read_text(encoding="utf-8").splitlines()[:5]]
                    result["mode"]="preview_only"
                    return json.dumps(result,ensure_ascii=False,indent=2)
            except (ValueError,KeyError,TypeError,json.JSONDecodeError) as exc:
                return json.dumps({"error":str(exc)},ensure_ascii=False,indent=2)
        gr.Button("한국어 학습 데이터 검증").click(preview_korean_sft,[translation_pairs,translation_prompt,translation_hash],translation_preview)
    with gr.Tab('GGUF 변환 · 경량화 · HF 업로드'):
        gr.Markdown("### GGUF 변환 / 양자화 / Hugging Face Model Hub\\n이 화면은 안전한 실행 명령을 생성합니다. 실제 변환과 업로드는 승인된 GPU/CPU 작업환경에서 실행하세요. 토큰은 HF_TOKEN 비밀 환경변수로 설정합니다.")
        gg_model=gr.Textbox(label="Transformers 모델 폴더",value="outputs/full_model")
        gg_llama=gr.Textbox(label="llama.cpp 폴더",value="/workspace/llama.cpp")
        gg_out=gr.Textbox(label="새 출력 폴더",value="outputs/gguf-export")
        gg_name=gr.Textbox(label="GGUF 모델 이름",value="my-korean-model")
        gg_quant=gr.Dropdown(label="경량화 양자화",choices=["Q8_0","Q6_K","Q5_K_M","Q4_K_M","Q3_K_M","Q2_K"],value="Q4_K_M")
        gg_adapter=gr.Textbox(label="LoRA/QLoRA 어댑터 폴더 (선택)",value="")
        gg_repo=gr.Textbox(label="Hugging Face 모델 저장소 (선택)",placeholder="username/model-name")
        gg_cmd=gr.Code(label="검토용 명령 (기본은 실행 계획만)",language="shell")
        def gguf_plan(model,llama,out,name,quant,adapter,repo):
            import shlex
            cmd=["python","training/gguf_pipeline.py","--model-dir",model,"--llama-cpp-dir",llama,"--output-dir",out,"--model-name",name,"--quant",quant]
            if adapter.strip():cmd+=["--adapter",adapter.strip()]
            if repo.strip():cmd+=["--repo-id",repo.strip()]
            return shlex.join(cmd)+"\\n# 실제 실행은 검증 후 --execute, 업로드는 --execute --upload 추가"
        gr.Button("변환 · 업로드 명령 생성").click(gguf_plan,[gg_model,gg_llama,gg_out,gg_name,gg_quant,gg_adapter,gg_repo],gg_cmd)
    with gr.Tab('자가 진단 · 자동 복구'):
        gr.Markdown("### Model Studio 자가 진단 · 안전한 자동 복구\\n설정 오류와 허용된 의존성을 검사합니다. 화면에서는 **읽기 전용 진단**만 실행하며, 설치·수정은 검토 후 명시적으로 승인해야 합니다.")
        selfheal_modules=gr.Textbox(label="검사할 모듈 (공백 구분)",value="gradio huggingface_hub transformers peft accelerate")
        selfheal_result=gr.Code(label="진단 결과",language="json")
        def selfheal_preview(modules):
            from training.self_heal import diagnose
            import json
            found=diagnose(None,modules.split())
            return json.dumps({"version":"1.35.9","mode":"dry_run","findings":found,
                               "status":"NOT_RUN","note":"설치나 수정은 수행하지 않았습니다."},
                              ensure_ascii=False,indent=2)
        gr.Button("의존성 진단 실행").click(selfheal_preview,selfheal_modules,selfheal_result)
    with gr.Tab('사용자 요구사항 기억 · 검증'):
        gr.Markdown("### 프로젝트 요구사항 기억 및 자동 검증\\n현재 저장된 요구사항을 확인하고 실제 파일·설정 검사를 수행합니다. 검사 PASS는 명시된 항목에만 해당하며 학습 성공이나 모델의 영구적 준수를 보장하지 않습니다.")
        requirements_status=gr.Code(label="검증 결과",language="json")
        def check_requirements():
            import subprocess,sys,pathlib
            root=pathlib.Path(__file__).resolve().parent
            p=subprocess.run([sys.executable,str(root/"training/requirements_memory.py"),"--workspace",str(root),"verify"],capture_output=True,text=True)
            return p.stdout if p.stdout else p.stderr
        gr.Button("기억된 요구사항 자동 검증").click(check_requirements,outputs=requirements_status)
    with gr.Tab('영구 저장소 · 분류 · 재활용'):
        gr.Markdown("### 분류형 버전 보관소\\n모델·어댑터·GGUF·데이터셋·프롬프트·설정·플러그인·원본 압축파일을 별도 스냅샷으로 보관합니다. 복원·재다운로드·재업로드는 CLI에서 명시적으로 승인합니다.")
        vault_path=gr.Textbox(label="보관소 폴더 (Spaces 영구 볼륨 예: /data/lovebound-vault)",value="/data/lovebound-vault")
        vault_command=gr.Code(label="보관소 명령",language="shell")
        def vault_command_preview(path):
            import shlex
            return shlex.join(["python","training/persistent_vault.py","--vault",path,"list"])
        gr.Button("보관소 목록 명령 생성").click(vault_command_preview,vault_path,vault_command)
    with gr.Tab('GitHub 자동 백업 · 저장소 생성'):
        gr.Markdown("### Hugging Face Spaces → GitHub 비공개 저장소 백업\\n승인 시 개인 비공개 저장소를 생성하고 보관소 ZIP을 Git LFS(대용량 파일)로 백업할 수 있습니다. 토큰은 Space Secrets의 GITHUB_TOKEN에 저장하세요.")
        gh_archive=gr.Textbox(label="Vault ZIP 파일 경로",value="/data/exports/snapshot.zip")
        gh_repo=gr.Textbox(label="GitHub 비공개 저장소 이름",value="LoveBound-AI-Model-Studio-Private-Vault")
        gh_command=gr.Code(label="검토할 백업 명령",language="shell")
        def github_backup_plan(archive,repo):
            import shlex
            return shlex.join(["python","training/github_auto_backup.py","--archive",archive,"--repo-name",repo])+"\\n# 명시적으로 승인한 경우에만 --apply --approve 추가"
        gr.Button("GitHub 백업 실행 명령 미리보기").click(github_backup_plan,[gh_archive,gh_repo],gh_command)
    with gr.Tab('플러그인 보존 상태'):
        gr.Code(value=json.dumps(inventory(),ensure_ascii=False,indent=2),language='json',label='패키지 목록')
        gr.Code(value=version_check(),language='json',label='버전 고정 검사')
    gr.Markdown('⚠️ **공개 Space 저장소에는 원본 ZIP 24개도 공개됩니다.** 업로드 전 각 소스의 라이선스와 개인정보/비밀정보 포함 여부를 반드시 확인하세요. 비공개 Space 사용을 권장합니다.')

if __name__=='__main__':
    demo.launch()
