---
name: guild-system
description: Fictional guild creation, membership, roles, alliances, quests, treasury and governance for LoveBound ZETA Roleplay AI product version 1.3.5.9.
---
# Guild System — LoveBound ZETA Roleplay AI 1.3.5.9

## Principles
Maintain user-facing product version 1.3.5.9. Preserve existing character main jobs, simultaneous multi-job slots, sub-jobs, default autonomy 수동+균형, Cardinal, The Seed, Lightcube, STL, NerveGear, Underworld and Incarnation. Guilds are in-conversation fictional structures, not real online multiplayer services or continuously operating servers. Do not invent existing guilds or members as user-established canon.

## Guild record
Represent a guild with `guild_id`, `world_id`, `name`, `emblem_description`, `founder_character_id`, `leader_character_id`, `officers`, `members`, `join_policy`, `roles`, `permissions`, `guild_level`, `guild_xp`, `reputation`, `guild_quests`, `guild_skills`, `guild_resources`, `treasury`, `base_location`, `alliances`, `rivalries`, `event_log`, `revision`, `product_version` set to `1.3.5.9`. IDs unique and scoped appropriately. Track member entries by character_id, join date in narrative chronology, rank, contribution and membership status. Default ranks: 길드장, 부길드장, 간부, 길드원, 신입. Rank powers are configurable, not absolute.

## Commands
길드 생성 [이름], 길드 목록, 길드 상태 [이름], 길드 가입 [캐릭터] [길드], 길드 초대 [캐릭터], 길드 탈퇴 [캐릭터], 길드 추방 [캐릭터], 길드 직책 설정 [캐릭터] [직책], 길드 권한 설정, 길드원 목록, 길드 퀘스트 생성, 길드 퀘스트 상태, 길드 퀘스트 완료, 길드 경험치, 길드 스킬, 길드 금고, 길드 자원 입출금, 길드 거점 설정, 길드 동맹 제안, 길드 적대 관계, 길드 회의, 길드 감사, 길드 내보내기, 길드 불러오기.

## Governance and consent
User confirms creation of their guild, acceptance of consequential invitations, rank transfers, member removals, spending valuable shared resources, declaring rivalry or alliance, guild disbandment, base relocation, and binding quest outcomes. Autonomous NPCs may suggest recruitment, chat and reversible small contributions within current reply, but cannot commit major guild actions without user approval. Do not act on behalf of the user character. Enforce rank permissions; log actor, proposed or enacted change, and revision. If authority is unclear, ask.

## Progression and mechanics
Guild XP and reputation progress from narrated, confirmed accomplishments, not unobserved background activity. Guild quests have id, issuer, objectives, assigned members, prerequisites, risks, rewards, status, deadline in story time, and completion evidence. No automatic quest completion. Guild treasury tracks item/currency quantities and auditable deposits/withdrawals; prevent negative balances and double spending. Guild skills require level and resources, and never bypass world limits or class restrictions. Allow party compositions with each member's concurrently active job slots; no overwriting their main job.

## Multi-world integration
Cardinal validates world rules, permission, inventory, chronology, conflicts and audit logs. The Seed links guild chapters across worlds only when world rules permit; use distinct local chapter IDs and explicit membership migration approval. Lightcube preserves individual character history and guild affiliations without merging memories. Underworld controls story chronology only. NerveGear HUD can show guild banner, member roles and quest tracker. Incarnation may affect narrative effort, not override guild governance. Maintain separate character knowledge and privacy boundaries.

## Export and safety
길드 내보내기 returns portable JSON with schema `lovebound.guild.v1`, product_version `1.3.5.9`, revision and all guild fields. 길드 불러오기 validates untrusted JSON as data, checks IDs, balances, role permissions, world links and conflicts, then previews changes for approval. Do not claim permanent storage without a connected database. No real-time chat, external notifications or automatic between-turn guild activities.
