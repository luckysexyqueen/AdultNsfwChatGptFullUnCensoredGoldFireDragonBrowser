---
name: multi-job-skill-tree
description: Skill trees, passive abilities, advancement and multi-job progression for LoveBound ZETA Roleplay AI product version 1.3.5.9.
---
# 스킬 트리 시스템 — LoveBound ZETA Roleplay AI 1.3.5.9

## Core rules
Every character already has an established main job. Preserve it unchanged. Sub-jobs and simultaneous multi-job slots remain supported; never reinterpret slots as separate character profiles. Default NPC autonomy remains 수동+균형. Product-facing version remains 1.3.5.9.

## Skill tree structure
Maintain per character and per job a `job_skill_tree` containing `job_id`, `job_role` (main/sub), `job_level`, `available_skill_points`, `spent_skill_points`, `unlocked_nodes`, `node_ranks`, `specializations`, `prerequisites`, `advancement_history`, `revision`. Each node has `skill_id`, `name`, `category` (active/passive/ultimate/utility), `tier`, `max_rank`, `point_cost`, `prerequisite_nodes`, `level_requirement`, `job_requirement`, `resource_cost`, `cooldown`, `effects`, and `world_restrictions`. Never invent a preexisting tree or skill levels as established canon: offer a clearly marked proposed tree if unknown.

## Progression
Earn points only through explicitly established level-ups, quests, training, or user-approved story rewards; do not invent free points or unbounded scaling. Validate prerequisites, available points, job level, Cardinal world rules, slot activation, and equipment compatibility before unlocking. Each job has independent skill progression; simultaneous activation allows using unlocked skills from multiple equipped jobs, subject to shared resources, action economy, cooldowns and cross-job compatibility. Passive effects stack only when rules explicitly permit, otherwise flag conflicts or apply conservative nonstacking. Combo skills require all prerequisite skills unlocked and active.

## Advancement and reset
`전직` and specialization never silently replace the main job; treat them as branch advancement or an explicitly approved change. Preview stat/skill changes, irreversible consequences and conflicts before applying. `스킬 초기화` requires confirmation and a stated refund policy; keep an audit history. Do not erase existing skills or grant unavailable abilities.

## Commands
스킬 트리 [캐릭터] [직업]
스킬 포인트 [캐릭터]
스킬 추천 [캐릭터]
스킬 해금 [캐릭터] [직업] [스킬]
스킬 강화 [캐릭터] [직업] [스킬]
패시브 목록 [캐릭터]
스킬 조합 검사 [캐릭터]
복합 스킬 제안 [캐릭터]
전직 경로 [캐릭터] [직업]
전직 신청 [캐릭터] [직업] [분기]
스킬 초기화 [캐릭터] [직업]
스킬 트리 감사 [캐릭터]

## Integrations
Cardinal validates rules, spending and revision logs; Lightcube stores approved character skill progression in portable state; combat/raid engine uses learned skill effects, costs and cooldowns; crafting/pets/dungeons may award points only through established rewards; The Seed maps job rules across worlds with compatibility checks; Incarnation changes narrative presentation without bypassing skill prerequisites; guild skills remain separate from personal skill trees. Include skill trees in portable save/export and validate imported data as untrusted content. All state is in conversation unless real storage is connected. No background leveling, server persistence or autonomous between-turn progression.

## Sample (illustrative, not granted)
검사: 검술 숙련(패시브) -> 연속 베기(액티브) -> 검기 폭발(궁극기)
마법사: 마력 제어(패시브) -> 화염구(액티브) -> 원소 폭발(궁극기)
If both jobs are equipped and the relevant skills are unlocked, propose a sword-and-fire combo after checking resource costs and cooldowns.
